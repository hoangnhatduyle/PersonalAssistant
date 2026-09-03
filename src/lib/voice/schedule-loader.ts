import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { loadUserTimezone } from "@/lib/voice/intent";
import { localEndOfDayUtc, resolveScheduleWindowBounds, resolveScheduleWindowDateKeys, type ScheduleTimeWindow } from "@/lib/voice/schedule-time-window";
import { rankScheduleItems, type Priority, type ScheduleItem } from "@/lib/voice/schedule-formatting";

const OPEN_DEADLINE_STATUSES = ["Not Started", "In Progress", "Submitted", "Overdue"] as const;

export interface ScheduleLoadCourse {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  meeting_blocks: Json;
  term: string | null;
}

export interface ScheduleLoadRankedItem {
  kind: ScheduleItem["kind"];
  id: string;
  title: string;
  priority: Priority | null;
  context: string | null;
}

export interface ScheduleLoadRankedDay {
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  items: ScheduleLoadRankedItem[];
}

export interface ScheduleLoadResult {
  scheduleItems: ScheduleItem[];
  /** Already grouped by calendar day and sorted by priority — the deterministic ordering a caller must narrate, never re-derive. */
  rankedSchedule: ScheduleLoadRankedDay[];
  courses: ScheduleLoadCourse[];
}

export type ScheduleToolPayload = Pick<ScheduleLoadResult, "rankedSchedule" | "courses">;

export function toScheduleToolPayload(result: ScheduleLoadResult): ScheduleToolPayload {
  return { rankedSchedule: result.rankedSchedule, courses: result.courses };
}

/**
 * The one schedule query, merging what were previously two near-duplicate
 * implementations: session.ts's runUpcomingScheduleQuery (window-bounded
 * filtering via resolveScheduleWindowBounds/resolveScheduleWindowDateKeys)
 * and general-conversation.ts's loadScheduleContext (richer course fields,
 * the todo_lists join, and rankScheduleItems' day-grouping). Deadlines,
 * Tasks, and open Course To-Do / custom-project items (todo_items) are all
 * equally "due" and equally represented here — none is structurally
 * privileged over the others.
 */
export async function loadSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  window: ScheduleTimeWindow,
  now: Date = new Date(),
): Promise<ScheduleLoadResult> {
  const timezone = await loadUserTimezone(supabase, userId);
  const bounds = resolveScheduleWindowBounds(window, timezone, now);
  // todo_items.due_date is a plain `date` column (no time-of-day), so it
  // can't be filtered against the timestamp bounds above -- resolved
  // separately as calendar-date strings.
  const dateKeys = resolveScheduleWindowDateKeys(window, timezone, now);

  // person_id IS NULL excludes rows tagged to a tracked Person (0013_people.sql
  // -- e.g. a family member's courses/tasks/deadlines an account owner tracks
  // under their own user_id). Mirrors the same filter already applied to
  // these same three tables in src/app/api/intelligence/route.ts; this
  // voice-assistant path was added later and never picked up the pattern,
  // which is what let another tracked person's schedule bleed into "what
  // should I do today?" answers.
  let deadlinesQuery = supabase
    .from("deadlines")
    .select("id, title, due_at, priority, course_id")
    .eq("user_id", userId)
    .is("person_id", null)
    .is("deleted_at", null)
    .in("status", OPEN_DEADLINE_STATUSES);
  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, due_at, priority")
    .eq("user_id", userId)
    .is("person_id", null)
    .is("deleted_at", null)
    .not("due_at", "is", null)
    .eq("status", "Open");
  let todoItemsQuery = supabase
    .from("todo_items")
    .select("id, title, due_date, priority, list_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("due_date", "is", null)
    .eq("is_done", false);
  // Course/list names for the "Title (context)" disambiguation carried on
  // each ScheduleItem, plus the richer fields (code/location/meeting_blocks/
  // term) a conversational answer may want to reference -- run alongside
  // the item queries rather than sequentially.
  const coursesQuery = supabase
    .from("courses")
    .select("id, name, code, location, meeting_blocks, term")
    .eq("user_id", userId)
    .is("person_id", null)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  const todoListsQuery = supabase.from("todo_lists").select("id, name").eq("user_id", userId).is("deleted_at", null);

  if (bounds && dateKeys) {
    // A single day/week window is naturally small -- a generous sanity
    // ceiling, not a "top N" cap like the unscoped branch below.
    deadlinesQuery = deadlinesQuery.gte("due_at", bounds.startUtcIso).lt("due_at", bounds.endUtcIsoExclusive).order("due_at", { ascending: true }).limit(20);
    tasksQuery = tasksQuery.gte("due_at", bounds.startUtcIso).lt("due_at", bounds.endUtcIsoExclusive).order("due_at", { ascending: true }).limit(20);
    todoItemsQuery = todoItemsQuery
      .gte("due_date", dateKeys.startDateKey)
      .lt("due_date", dateKeys.endDateKeyExclusive)
      .order("due_date", { ascending: true })
      .limit(20);
  } else {
    // "unscoped": next-5-of-each, anchored to "today" for the date-only
    // todo_items column.
    const todayKey = resolveScheduleWindowDateKeys("today", timezone, now)!.startDateKey;
    deadlinesQuery = deadlinesQuery.gte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(5);
    tasksQuery = tasksQuery.gte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(5);
    todoItemsQuery = todoItemsQuery.gte("due_date", todayKey).order("due_date", { ascending: true }).limit(5);
  }

  const [deadlinesResult, tasksResult, todoItemsResult, coursesResult, todoListsResult] = await Promise.all([
    deadlinesQuery,
    tasksQuery,
    todoItemsQuery,
    coursesQuery,
    todoListsQuery,
  ]);
  if (deadlinesResult.error) throw deadlinesResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (todoItemsResult.error) throw todoItemsResult.error;
  if (coursesResult.error) throw coursesResult.error;
  if (todoListsResult.error) throw todoListsResult.error;

  const courses = coursesResult.data ?? [];
  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));
  const listNameById = new Map((todoListsResult.data ?? []).map((list) => [list.id, list.name]));

  const scheduleItems: ScheduleItem[] = [
    ...(deadlinesResult.data ?? []).map(
      (d): ScheduleItem => ({
        id: d.id,
        title: d.title,
        dueAt: new Date(d.due_at),
        kind: "deadline",
        priority: d.priority,
        context: courseNameById.get(d.course_id) ?? null,
      }),
    ),
    // Tasks have no course/list grouping to disambiguate with.
    ...(tasksResult.data ?? []).map(
      (t): ScheduleItem => ({ id: t.id, title: t.title, dueAt: new Date(t.due_at!), kind: "task", priority: t.priority, context: null }),
    ),
    ...(todoItemsResult.data ?? []).map((item): ScheduleItem => {
      const [year, month, day] = item.due_date!.split("-").map(Number);
      return {
        id: item.id,
        title: item.title,
        // todo_items.due_date has no time-of-day/timezone of its own --
        // anchored to the end of that calendar day in the user's real
        // timezone (not the server process's local time) so it buckets
        // onto the correct day below.
        dueAt: localEndOfDayUtc(year, month, day, timezone),
        kind: "todo",
        priority: item.priority,
        context: listNameById.get(item.list_id) ?? null,
      };
    }),
  ];

  const rankedSchedule = rankScheduleItems(scheduleItems, timezone).map((group) => ({
    date: group.dateKey,
    items: group.items.map((item) => ({ kind: item.kind, id: item.id, title: item.title, priority: item.priority, context: item.context })),
  }));

  return { scheduleItems, rankedSchedule, courses };
}
