import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadUserTimezone } from "@/lib/voice/intent";
import {
  addDaysToDateKey,
  enumerateDateKeys,
  localEndOfDayUtc,
  localMidnightUtc,
  resolveScheduleWindowBounds,
  resolveScheduleWindowDateKeys,
  type ScheduleTimeWindow,
} from "@/lib/voice/schedule-time-window";
import { rankScheduleItems, type Priority, type ScheduleItem } from "@/lib/voice/schedule-formatting";
import { expandBlockForDateKeys, formatMinutesOfDay, type MeetingBlock } from "@/lib/calendar/recurrence";

const OPEN_DEADLINE_STATUSES = ["Not Started", "In Progress", "Submitted", "Overdue"] as const;

export interface ScheduleLoadCourse {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  meeting_blocks: MeetingBlock[];
  term: string | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
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

export interface ScheduleToolPayload {
  rankedSchedule: ScheduleLoadRankedDay[];
}

/**
 * Confirmed root cause of a real, reproduced hallucination (a model narrating
 * a Wednesday-only class as happening on an unrelated Monday, for an
 * explicit date whose own rankedSchedule was empty) -- confirmed NOT to be
 * conversation-history contamination (reproduced as the very first message
 * of a brand-new conversation) and NOT fixable by more reasoning effort
 * (reproduced again at reasoning_effort "medium", a verified >14s,
 * genuinely-elevated-effort narration call). Directly verified by logging
 * the actual tool payload: even after stripping result.courses down to a
 * bare {id, name, code} (no meeting_blocks/recurrence dates), the model
 * STILL fabricated a class meeting from the mere presence of a course name
 * in a top-level "courses" list, with rankedSchedule sitting right next to
 * it saying nothing was scheduled. The fix is to never send that top-level
 * list to the model at all: it was always redundant for narration anyway --
 * every ScheduleLoadRankedItem.context is already resolved server-side to
 * the right course/list name per item (see the "Homework 1 for CS 101"
 * convention in conversation-core.ts's system prompt), so nothing legitimate
 * is lost by dropping it. rankedSchedule alone is what the model may narrate
 * from. (result.courses stays on ScheduleLoadResult -- schedule-loader.ts's
 * own courseNameById/buildCourseScheduleItems still need the full row
 * server-side; only the model-facing payload boundary changed.)
 */
export function toScheduleToolPayload(result: ScheduleLoadResult): ScheduleToolPayload {
  return { rankedSchedule: result.rankedSchedule };
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
  personId?: string,
  explicitDateKey?: string,
): Promise<ScheduleLoadResult> {
  const timezone = await loadUserTimezone(supabase, userId);
  const bounds = resolveScheduleWindowBounds(window, timezone, now, explicitDateKey);
  // todo_items.due_date is a plain `date` column (no time-of-day), so it
  // can't be filtered against the timestamp bounds above -- resolved
  // separately as calendar-date strings.
  const dateKeys = resolveScheduleWindowDateKeys(window, timezone, now, explicitDateKey);

  // Deadlines and Course To-Do items (todo_items) are never part of a
  // tracked Person's (0013_people.sql) schedule: Deadlines by product
  // decision (a Deadline only ever gets a person_id indirectly, by
  // inheriting it from an assigned Course -- the app has no flow to assign
  // one directly, and a Person's schedule should never surface one anyway),
  // and todo_items structurally (0013_people.sql never added a person_id
  // column to it at all -- only the account owner has Course To-Do items).
  // Both queries below are skipped entirely (never sent to the DB, not just
  // filtered) whenever personId is set.
  const includeOwnerOnlyData = !personId;

  let deadlinesQuery = supabase
    .from("deadlines")
    .select("id, title, due_at, priority, course_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("person_id", null)
    .in("status", OPEN_DEADLINE_STATUSES);
  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, due_at, priority")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("due_at", "is", null)
    .eq("status", "Open");
  tasksQuery = personId ? tasksQuery.eq("person_id", personId) : tasksQuery.is("person_id", null);
  let todoItemsQuery = supabase
    .from("todo_items")
    .select("id, title, due_date, priority, list_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("due_date", "is", null)
    .eq("is_done", false);
  // Deadline Sessions (planned work sessions toward a Deadline -- appointments
  // rows with category "Session"/session_status "planned") are, like
  // Deadlines and Course To-Do items, an owner-only concept: a tracked
  // Person is never assigned a Deadline directly in this app, so there is
  // nothing for a Session to attach to on their side either.
  let sessionsQuery = supabase
    .from("appointments")
    .select("id, title, date, time, deadline_id")
    .eq("user_id", userId)
    .eq("category", "Session")
    .eq("session_status", "planned")
    .is("deleted_at", null);
  // Session rows only carry a deadline_id, not the Deadline's own title --
  // fetched unscoped (all the owner's open Deadlines, not window-bounded)
  // since a session's linked Deadline may be due well outside the window
  // being asked about. Small, indexed, per-user query -- same "fetch once,
  // look up by id" shape as courseNameById/listNameById below.
  const deadlineTitlesQuery = supabase.from("deadlines").select("id, title").eq("user_id", userId).is("deleted_at", null);
  // Course/list names for the "Title (context)" disambiguation carried on
  // each ScheduleItem, plus the richer fields (code/location/meeting_blocks/
  // recurrence_start_date/recurrence_end_date/term) needed to expand each
  // course's recurring class times into actual dated occurrences below --
  // run alongside the item queries rather than sequentially.
  let coursesQuery = supabase
    .from("courses")
    .select("id, name, code, location, meeting_blocks, term, recurrence_start_date, recurrence_end_date")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  coursesQuery = personId ? coursesQuery.eq("person_id", personId) : coursesQuery.is("person_id", null);
  const todoListsQuery = supabase.from("todo_lists").select("id, name").eq("user_id", userId).is("deleted_at", null);

  let todayKeyForUnscoped: string | undefined;
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
    sessionsQuery = sessionsQuery
      .gte("date", dateKeys.startDateKey)
      .lt("date", dateKeys.endDateKeyExclusive)
      .order("date", { ascending: true })
      .limit(20);
  } else {
    // "unscoped": next-5-of-each, anchored to "today" for the date-only
    // todo_items/appointments.date columns.
    todayKeyForUnscoped = resolveScheduleWindowDateKeys("today", timezone, now)!.startDateKey;
    deadlinesQuery = deadlinesQuery.gte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(5);
    tasksQuery = tasksQuery.gte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(5);
    todoItemsQuery = todoItemsQuery.gte("due_date", todayKeyForUnscoped).order("due_date", { ascending: true }).limit(5);
    sessionsQuery = sessionsQuery.gte("date", todayKeyForUnscoped).order("date", { ascending: true }).limit(5);
  }

  // Resolved-empty stand-ins (never touch the DB) for the owner-only
  // queries when this is a person-scoped call -- see includeOwnerOnlyData
  // above. `data: null` round-trips through the same `?? []` fallback used
  // for a real empty result below.
  const skippedResult = Promise.resolve({ data: null, error: null });

  const [deadlinesResult, tasksResult, todoItemsResult, coursesResult, todoListsResult, sessionsResult, deadlineTitlesResult] =
    await Promise.all([
      includeOwnerOnlyData ? deadlinesQuery : skippedResult,
      tasksQuery,
      includeOwnerOnlyData ? todoItemsQuery : skippedResult,
      coursesQuery,
      todoListsQuery,
      includeOwnerOnlyData ? sessionsQuery : skippedResult,
      includeOwnerOnlyData ? deadlineTitlesQuery : skippedResult,
    ]);
  if (deadlinesResult.error) throw deadlinesResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (todoItemsResult.error) throw todoItemsResult.error;
  if (coursesResult.error) throw coursesResult.error;
  if (todoListsResult.error) throw todoListsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (deadlineTitlesResult.error) throw deadlineTitlesResult.error;

  // meeting_blocks/recurrence_start_date/recurrence_end_date are typed
  // generically (Json/string) by the Supabase generator, which can't see the
  // app-level MeetingBlock[] shape actually stored -- same widening
  // convention as entity-types.ts's CourseRow and intelligence/route.ts's
  // inline meeting_blocks cast.
  const courses = (coursesResult.data ?? []) as unknown as ScheduleLoadCourse[];
  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));
  const listNameById = new Map((todoListsResult.data ?? []).map((list) => [list.id, list.name]));
  const deadlineTitleById = new Map((deadlineTitlesResult.data ?? []).map((d) => [d.id, d.title]));

  const courseScheduleItems = buildCourseScheduleItems(courses, dateKeys, todayKeyForUnscoped, timezone);

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
    ...(sessionsResult.data ?? []).map((session): ScheduleItem => {
      const [year, month, day] = session.date.split("-").map(Number);
      const deadlineTitle = deadlineTitleById.get(session.deadline_id!) ?? null;
      // appointments.time is a free-text label (e.g. "Starting at 7:00 PM"),
      // not a structured clock value -- see the deleted Session-scheduling
      // investigation this shipped alongside -- so it's folded into context
      // as opaque display color, never parsed into dueAt.
      const context = deadlineTitle && session.time ? `${deadlineTitle} — ${session.time}` : (deadlineTitle ?? session.time ?? null);
      return {
        id: session.id,
        title: session.title,
        // appointments.date has no time-of-day/timezone of its own -- same
        // anchoring convention as todo_items.due_date above.
        dueAt: localEndOfDayUtc(year, month, day, timezone),
        kind: "session",
        priority: null,
        context,
      };
    }),
    ...courseScheduleItems,
  ];

  const rankedSchedule = rankScheduleItems(scheduleItems, timezone).map((group) => ({
    date: group.dateKey,
    items: group.items.map((item) => ({ kind: item.kind, id: item.id, title: item.title, priority: item.priority, context: item.context })),
  }));

  return { scheduleItems, rankedSchedule, courses };
}

const WINDOWED_COURSE_ITEM_CAP = 30;
const UNSCOPED_COURSE_LOOKAHEAD_DAYS = 90;
const UNSCOPED_COURSE_ITEM_CAP = 5;

/**
 * Expands every course's recurring meeting_blocks into dated ScheduleItems
 * ("kind: course") for the resolved window -- runs identically for self and
 * person-scoped calls, since `courses` here is already the correctly-scoped
 * list from coursesQuery's own .eq/.is split (no new personId branching
 * needed). `dateKeys` is the bounded window's {startDateKey,
 * endDateKeyExclusive} (today/tomorrow/week/date); when null ("unscoped"),
 * scans forward day-by-day from `todayKeyForUnscoped` for parity with the
 * "next N upcoming" treatment already given to deadlines/tasks/todos above.
 */
function buildCourseScheduleItems(
  courses: ScheduleLoadCourse[],
  dateKeys: { startDateKey: string; endDateKeyExclusive: string } | null,
  todayKeyForUnscoped: string | undefined,
  timezone: string,
): ScheduleItem[] {
  if (courses.length === 0) return [];

  const dateKeysToExpand = dateKeys
    ? enumerateDateKeys(dateKeys.startDateKey, dateKeys.endDateKeyExclusive)
    : enumerateDateKeys(todayKeyForUnscoped!, addDaysToDateKey(todayKeyForUnscoped!, UNSCOPED_COURSE_LOOKAHEAD_DAYS));

  const items: ScheduleItem[] = [];
  for (const course of courses) {
    for (const block of course.meeting_blocks) {
      const occurrences = expandBlockForDateKeys(block, dateKeysToExpand, course.recurrence_start_date, course.recurrence_end_date);
      for (const occurrence of occurrences) {
        const [year, month, day] = occurrence.dateKey.split("-").map(Number);
        const dueAt = new Date(localMidnightUtc(year, month, day, timezone).getTime() + occurrence.startMinutes * 60_000);
        const timeRange = `${formatMinutesOfDay(occurrence.startMinutes)}–${formatMinutesOfDay(occurrence.endMinutes)}`;
        items.push({
          id: `course:${course.id}:${occurrence.dateKey}:${block.startMinutes}`,
          title: course.code ? `${course.code} ${course.name}` : course.name,
          dueAt,
          kind: "course",
          priority: null,
          context: course.location ? `${timeRange} in ${course.location}` : timeRange,
        });
      }
    }
  }

  items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return items.slice(0, dateKeys ? WINDOWED_COURSE_ITEM_CAP : UNSCOPED_COURSE_ITEM_CAP);
}
