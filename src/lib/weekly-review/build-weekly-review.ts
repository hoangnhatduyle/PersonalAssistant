import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";
import { enumerateDateKeys } from "@/lib/voice/schedule-time-window";
import { zonedDateKey } from "@/lib/voice/schedule-formatting";
import { weekdayName } from "@/lib/weekly-review/week-window";
import type {
  NextWeekDay,
  NextWeekItem,
  PastDueItem,
  ReviewItem,
  WeeklyReviewData,
  WeeklyReviewRows,
  WeeklyReviewWindow,
} from "@/lib/weekly-review/types";

/** A day with this many items due reads as a pile-up. Same threshold as WorkloadDensityStrip. */
export const COLLISION_THRESHOLD = 3;
const MAX_PAST_DUE_ITEMS = 8;
const MAX_NEXT_WEEK_ITEMS = 8;
const MAX_UNPLANNED_DEADLINES = 5;
const MAX_TITLES_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Entry extends ReviewItem {
  dueAt: Date | null;
  completedAt: Date | null;
  done: boolean;
  open: boolean;
}

function toEntries(rows: WeeklyReviewRows): Entry[] {
  const deadlines = rows.deadlines.map<Entry>((deadline) => ({
    kind: "deadline",
    id: deadline.id,
    title: deadline.title,
    context: (deadline.course_id && rows.courseNameById.get(deadline.course_id)) || null,
    dueAt: new Date(deadline.due_at),
    completedAt: deadline.completed_at ? new Date(deadline.completed_at) : null,
    done: deadline.status === "Completed",
    open: isOpenDeadline(deadline.status),
  }));
  const tasks = rows.tasks.map<Entry>((task) => ({
    kind: "task",
    id: task.id,
    title: task.title,
    context: null,
    dueAt: task.due_at ? new Date(task.due_at) : null,
    completedAt: task.completed_at ? new Date(task.completed_at) : null,
    done: task.status === "Done",
    open: isOpenTask(task.status),
  }));
  return [...deadlines, ...tasks];
}

function inRange(date: Date | null, start: Date, endExclusive: Date): date is Date {
  return date !== null && date >= start && date < endExclusive;
}

function dayDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

const byDueAt = (a: Entry, b: Entry) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);

/**
 * Pure rollup of last week's results, what is still open, and next week's
 * load. All day bucketing happens in `window.timezone`, and completion is
 * judged by `completed_at` (never `updated_at`, which any edit bumps).
 */
export function buildWeeklyReview(rows: WeeklyReviewRows, window: WeeklyReviewWindow, now: Date): WeeklyReviewData {
  const entries = toEntries(rows);
  const tz = window.timezone;

  // --- Last week -----------------------------------------------------------
  const completedCount = entries.filter((entry) => entry.done && inRange(entry.completedAt, window.lastStartUtc, window.tomorrowStartUtc)).length;

  // "Planned" = due inside the window and either already past due or already
  // done. Cancelled items were never owed, and something due later tonight
  // that is still open is not a miss yet.
  const planned = entries.filter(
    (entry) => inRange(entry.dueAt, window.lastStartUtc, window.tomorrowStartUtc) && (entry.done || (entry.open && entry.dueAt! <= now)),
  );
  const completedOnTime = planned.filter((entry) => entry.done && entry.completedAt && entry.completedAt <= entry.dueAt!).length;
  const completedLate = planned.filter((entry) => entry.done && entry.completedAt && entry.completedAt > entry.dueAt!).length;
  const judged = completedOnTime + completedLate;

  const lastSessions = rows.sessions.filter((session) => session.date >= window.lastStartKey && session.date < window.nextStartKey);
  const countSessions = (status: string) => lastSessions.filter((session) => session.session_status === status).length;

  // --- Pending -------------------------------------------------------------
  const pastDue = entries.filter((entry) => entry.open && entry.dueAt !== null && entry.dueAt < window.todayStartUtc).sort(byDueAt);
  const pastDueItems: PastDueItem[] = pastDue.slice(0, MAX_PAST_DUE_ITEMS).map((entry) => ({
    kind: entry.kind,
    id: entry.id,
    title: entry.title,
    context: entry.context,
    daysOverdue: Math.max(1, dayDiff(zonedDateKey(entry.dueAt!, tz), window.todayKey)),
  }));
  const dueTodayCount = entries.filter((entry) => entry.open && inRange(entry.dueAt, window.todayStartUtc, window.tomorrowStartUtc)).length;

  // --- Next week -----------------------------------------------------------
  const nextEntries = entries.filter((entry) => entry.open && inRange(entry.dueAt, window.tomorrowStartUtc, window.nextEndUtcExclusive)).sort(byDueAt);
  const plannedSessionsByDay = new Map<string, number>();
  for (const session of rows.sessions) {
    if (session.session_status !== "planned") continue;
    plannedSessionsByDay.set(session.date, (plannedSessionsByDay.get(session.date) ?? 0) + 1);
  }

  const days: NextWeekDay[] = enumerateDateKeys(window.nextStartKey, window.nextEndKeyExclusive).map((dateKey) => {
    const due = nextEntries.filter((entry) => zonedDateKey(entry.dueAt!, tz) === dateKey);
    const deadlineCount = due.filter((entry) => entry.kind === "deadline").length;
    return {
      dateKey,
      weekday: weekdayName(dateKey),
      deadlineCount,
      taskCount: due.length - deadlineCount,
      sessionCount: plannedSessionsByDay.get(dateKey) ?? 0,
      total: due.length,
      titles: due.slice(0, MAX_TITLES_PER_DAY).map((entry) => entry.title),
    };
  });

  const toNextItem = (entry: Entry): NextWeekItem => {
    const dueKey = zonedDateKey(entry.dueAt!, tz);
    return { kind: entry.kind, id: entry.id, title: entry.title, context: entry.context, dueKey, weekday: weekdayName(dueKey) };
  };

  const coveredDeadlineIds = new Set(
    rows.sessionsForUpcomingDeadlines
      .filter((session) => session.session_status === "planned" || session.session_status === "done")
      .map((session) => session.deadline_id),
  );
  const deadlinesWithoutSessions = nextEntries
    .filter((entry) => entry.kind === "deadline" && !coveredDeadlineIds.has(entry.id))
    .slice(0, MAX_UNPLANNED_DEADLINES)
    .map(toNextItem);

  const busiest = days.reduce<NextWeekDay | null>((best, day) => (day.total > (best?.total ?? 0) ? day : best), null);

  return {
    timezone: tz,
    weekKey: window.todayKey,
    lastWeek: {
      completedCount,
      dueCount: planned.length,
      completedOnTime,
      completedLate,
      stillOpen: planned.filter((entry) => entry.open).length,
      onTimeRate: judged > 0 ? Math.round((completedOnTime / judged) * 100) : null,
      sessions: { done: countSessions("done"), skipped: countSessions("skipped"), planned: countSessions("planned") },
    },
    pending: { pastDueCount: pastDue.length, pastDueItems, dueTodayCount },
    nextWeek: {
      days,
      total: nextEntries.length,
      busiestDay: busiest,
      collisionDays: days.filter((day) => day.total >= COLLISION_THRESHOLD),
      items: nextEntries.slice(0, MAX_NEXT_WEEK_ITEMS).map(toNextItem),
      deadlinesWithoutSessions,
    },
  };
}
