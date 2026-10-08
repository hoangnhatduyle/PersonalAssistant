import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ReviewDeadline, ReviewSession, ReviewTask, WeeklyReviewRows, WeeklyReviewWindow } from "@/lib/weekly-review/types";

const OPEN_DEADLINE_STATUSES = ["Not Started", "In Progress", "Submitted", "Overdue"] as const;
const DEADLINE_COLUMNS = "id, title, due_at, status, completed_at, course_id, priority";
const TASK_COLUMNS = "id, title, due_at, status, completed_at, priority";
/** Older still-open items beyond this are summarised by the first N; the review only names a handful anyway. */
const OLDER_OPEN_LIMIT = 200;

function dedupeById<T extends { id: string }>(...lists: T[][]): T[] {
  return [...new Map(lists.flat().map((row) => [row.id, row])).values()];
}

/**
 * Everything the review needs, user-scoped and owner-only (person_id IS NULL,
 * matching the dashboard). Three overlapping slices per table, merged by id:
 *   1. anything due across both windows (any status)
 *   2. still-open items due before the last window (older past-due)
 *   3. items completed inside the last window (may have been due earlier)
 * Throws on any query error, like schedule-loader.ts.
 */
export async function loadWeeklyReviewRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  window: WeeklyReviewWindow,
): Promise<WeeklyReviewRows> {
  const lastStart = window.lastStartUtc.toISOString();
  const tomorrowStart = window.tomorrowStartUtc.toISOString();
  const nextEnd = window.nextEndUtcExclusive.toISOString();

  const deadlinesBase = () => supabase.from("deadlines").select(DEADLINE_COLUMNS).eq("user_id", userId).is("deleted_at", null).is("person_id", null);
  const tasksBase = () => supabase.from("tasks").select(TASK_COLUMNS).eq("user_id", userId).is("deleted_at", null).is("person_id", null);

  const [
    dueDeadlines,
    olderDeadlines,
    completedDeadlines,
    dueTasks,
    olderTasks,
    completedTasks,
    courses,
    sessions,
  ] = await Promise.all([
    deadlinesBase().gte("due_at", lastStart).lt("due_at", nextEnd),
    deadlinesBase().in("status", [...OPEN_DEADLINE_STATUSES]).lt("due_at", lastStart).order("due_at", { ascending: true }).limit(OLDER_OPEN_LIMIT),
    deadlinesBase().eq("status", "Completed").gte("completed_at", lastStart).lt("completed_at", tomorrowStart),
    tasksBase().gte("due_at", lastStart).lt("due_at", nextEnd),
    tasksBase().eq("status", "Open").lt("due_at", lastStart).order("due_at", { ascending: true }).limit(OLDER_OPEN_LIMIT),
    tasksBase().eq("status", "Done").gte("completed_at", lastStart).lt("completed_at", tomorrowStart),
    supabase.from("courses").select("id, name").eq("user_id", userId).is("deleted_at", null).is("person_id", null),
    supabase
      .from("appointments")
      .select("deadline_id, session_status, date")
      .eq("user_id", userId)
      .eq("category", "Session")
      .is("deleted_at", null)
      .gte("date", window.lastStartKey)
      .lt("date", window.nextEndKeyExclusive),
  ]);

  for (const result of [dueDeadlines, olderDeadlines, completedDeadlines, dueTasks, olderTasks, completedTasks, courses, sessions]) {
    if (result.error) throw result.error;
  }

  const deadlines: ReviewDeadline[] = dedupeById(dueDeadlines.data ?? [], olderDeadlines.data ?? [], completedDeadlines.data ?? []);
  const tasks: ReviewTask[] = dedupeById(dueTasks.data ?? [], olderTasks.data ?? [], completedTasks.data ?? []);

  // "No sessions planned yet" has to look at every date, not just the windows.
  const upcomingDeadlineIds = deadlines
    .filter((deadline) => deadline.due_at >= tomorrowStart && deadline.due_at < nextEnd)
    .map((deadline) => deadline.id);
  let sessionsForUpcomingDeadlines: ReviewSession[] = [];
  if (upcomingDeadlineIds.length > 0) {
    const result = await supabase
      .from("appointments")
      .select("deadline_id, session_status, date")
      .eq("user_id", userId)
      .eq("category", "Session")
      .is("deleted_at", null)
      .in("deadline_id", upcomingDeadlineIds);
    if (result.error) throw result.error;
    sessionsForUpcomingDeadlines = result.data ?? [];
  }

  return {
    deadlines,
    tasks,
    sessions: sessions.data ?? [],
    sessionsForUpcomingDeadlines,
    courseNameById: new Map((courses.data ?? []).map((course) => [course.id, course.name])),
  };
}
