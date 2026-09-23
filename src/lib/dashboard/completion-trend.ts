import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface CompletedItem {
  id: string;
  kind: "deadline" | "task";
  title: string;
  at: Date;
  href: string;
}

/**
 * The actual rows behind buildCycleTimeTrendPoints' per-day counts,
 * most-recent-first — feeds MomentumCard's "what got done" breakdown list.
 * Same trailing-window and completed_at logic as buildCycleTimeTrendPoints.
 */
export function buildCompletedThisWeek(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): CompletedItem[] {
  const todayStart = startOfDay(new Date());
  const isWithinWindow = (completedAt: string) => {
    const diffDays = Math.round((todayStart - startOfDay(new Date(completedAt))) / DAY_MS);
    return diffDays >= 0 && diffDays < days;
  };

  const items: CompletedItem[] = [];

  for (const deadline of deadlines) {
    if (deadline.status === "Completed" && deadline.completed_at && isWithinWindow(deadline.completed_at)) {
      items.push({ id: deadline.id, kind: "deadline", title: deadline.title, at: new Date(deadline.completed_at), href: `/courses/deadlines/${deadline.id}` });
    }
  }
  for (const task of tasks) {
    if (task.status === "Done" && task.completed_at && isWithinWindow(task.completed_at)) {
      items.push({ id: task.id, kind: "task", title: task.title, at: new Date(task.completed_at), href: `/board/${task.id}` });
    }
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function cycleTimeDays(createdAt: string, completedAt: string): number {
  return Math.max(0, (new Date(completedAt).getTime() - new Date(createdAt).getTime()) / DAY_MS);
}

/** Terminal-status + trailing-window predicate shared by every stat below —
 * same rule buildCompletedThisWeek already encodes, factored out so it
 * isn't repeated four more times. Rows without a
 * completed_at (pre-migration batch-write rows left unbackfilled) never
 * match any window — excluded, not guessed at. */
function isCompletedWithin(
  status: string,
  terminalStatus: string,
  completedAt: string | null,
  todayStart: number,
  windowStart: number,
  windowEnd: number,
): boolean {
  if (status !== terminalStatus || completedAt === null) return false;
  const diffDays = Math.round((todayStart - startOfDay(new Date(completedAt))) / DAY_MS);
  return diffDays >= windowStart && diffDays < windowEnd;
}

export interface CycleTimeStats {
  thisWeekAvgDays: number | null;
  lastWeekAvgDays: number | null;
  /** thisWeekAvgDays - lastWeekAvgDays; negative = faster. Null unless both sides have data. */
  deltaDays: number | null;
}

/**
 * Avg time from created_at to completed_at, for items completed this
 * trailing window vs. the window immediately before it — the actual
 * "faster or slower" signal MomentumCard's headline stat needs, as opposed
 * to buildCycleTimeTrendPoints' per-day breakdown.
 */
export function buildCycleTimeStats(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): CycleTimeStats {
  const todayStart = startOfDay(new Date());
  const thisWeek: number[] = [];
  const lastWeek: number[] = [];

  const bucket = (status: string, terminalStatus: string, createdAt: string, completedAt: string | null) => {
    if (isCompletedWithin(status, terminalStatus, completedAt, todayStart, 0, days)) {
      thisWeek.push(cycleTimeDays(createdAt, completedAt as string));
    } else if (isCompletedWithin(status, terminalStatus, completedAt, todayStart, days, days * 2)) {
      lastWeek.push(cycleTimeDays(createdAt, completedAt as string));
    }
  };

  for (const deadline of deadlines) bucket(deadline.status, "Completed", deadline.created_at, deadline.completed_at);
  for (const task of tasks) bucket(task.status, "Done", task.created_at, task.completed_at);

  const average = (values: number[]) => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length);
  const thisWeekAvgDays = average(thisWeek);
  const lastWeekAvgDays = average(lastWeek);
  const deltaDays = thisWeekAvgDays !== null && lastWeekAvgDays !== null ? thisWeekAvgDays - lastWeekAvgDays : null;

  return { thisWeekAvgDays, lastWeekAvgDays, deltaDays };
}

export interface OnTimeCompletionStats {
  /** 0-100, null when eligibleCount is 0. */
  rate: number | null;
  onTimeCount: number;
  /** Completions this week that had a due_at to judge against — Tasks with due_at: null are excluded, not counted as late. */
  eligibleCount: number;
  completedCount: number;
}

/**
 * % of this week's completions that landed at or before their own due_at —
 * ties pace to what was actually demanded, not just completion volume.
 */
export function buildOnTimeCompletionRate(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): OnTimeCompletionStats {
  const todayStart = startOfDay(new Date());
  let onTimeCount = 0;
  let eligibleCount = 0;
  let completedCount = 0;

  const record = (status: string, terminalStatus: string, completedAt: string | null, dueAt: string | null) => {
    if (!isCompletedWithin(status, terminalStatus, completedAt, todayStart, 0, days)) return;
    completedCount += 1;
    if (dueAt === null) return;
    eligibleCount += 1;
    if (new Date(completedAt as string).getTime() <= new Date(dueAt).getTime()) onTimeCount += 1;
  };

  for (const deadline of deadlines) record(deadline.status, "Completed", deadline.completed_at, deadline.due_at);
  for (const task of tasks) record(task.status, "Done", task.completed_at, task.due_at);

  return {
    rate: eligibleCount === 0 ? null : (onTimeCount / eligibleCount) * 100,
    onTimeCount,
    eligibleCount,
    completedCount,
  };
}

export interface NetBacklogDelta {
  /** completedCount - createdCount, signed. Positive = backlog shrinking. */
  delta: number;
  completedCount: number;
  createdCount: number;
}

/**
 * Completions this week minus newly created items this week — throughput
 * net of intake. A high completion count can still mean a growing backlog
 * if intake outpaces it; this catches that where a raw count can't.
 */
export function buildNetBacklogDelta(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): NetBacklogDelta {
  const todayStart = startOfDay(new Date());
  const isWithinWindow = (timestamp: string) => {
    const diffDays = Math.round((todayStart - startOfDay(new Date(timestamp))) / DAY_MS);
    return diffDays >= 0 && diffDays < days;
  };

  let completedCount = 0;
  let createdCount = 0;

  for (const deadline of deadlines) {
    if (deadline.status === "Completed" && deadline.completed_at && isWithinWindow(deadline.completed_at)) completedCount += 1;
    if (isWithinWindow(deadline.created_at)) createdCount += 1;
  }
  for (const task of tasks) {
    if (task.status === "Done" && task.completed_at && isWithinWindow(task.completed_at)) completedCount += 1;
    if (isWithinWindow(task.created_at)) createdCount += 1;
  }

  return { delta: completedCount - createdCount, completedCount, createdCount };
}

export interface CycleTimeTrendPoint {
  /** Local midnight for this bucket's day. */
  date: Date;
  /** Avg cycle-time-in-days of items completed that day; null (not 0) when nothing completed, so the chart can render "no data" distinctly from "instant turnaround". */
  avgDays: number | null;
  /** Raw count of items completed that day — also this trend's contribution to "resolved this week" when summed. */
  count: number;
}

/**
 * Daily cycle-time averages (plus the underlying count and calendar date)
 * over the trailing `days` window, oldest first, today last — feeds
 * MomentumCard's trend chart. Supersedes the old count-only/cycle-time-only
 * bucket pair: everything the chart needs (what day, how fast, how many)
 * comes from one pass over the same completed_at-gated rows so the numbers
 * can never drift apart from each other.
 */
export function buildCycleTimeTrendPoints(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): CycleTimeTrendPoint[] {
  const todayStart = startOfDay(new Date());
  const sums = new Array(days).fill(0) as number[];
  const counts = new Array(days).fill(0) as number[];

  const record = (createdAt: string, completedAt: string) => {
    const diffDays = Math.round((todayStart - startOfDay(new Date(completedAt))) / DAY_MS);
    const index = days - 1 - diffDays;
    if (index >= 0 && index < days) {
      sums[index] += cycleTimeDays(createdAt, completedAt);
      counts[index] += 1;
    }
  };

  for (const deadline of deadlines) {
    if (deadline.status === "Completed" && deadline.completed_at) record(deadline.created_at, deadline.completed_at);
  }
  for (const task of tasks) {
    if (task.status === "Done" && task.completed_at) record(task.created_at, task.completed_at);
  }

  return counts.map((count, index) => ({
    date: new Date(todayStart - (days - 1 - index) * DAY_MS),
    avgDays: count === 0 ? null : sums[index] / count,
    count,
  }));
}
