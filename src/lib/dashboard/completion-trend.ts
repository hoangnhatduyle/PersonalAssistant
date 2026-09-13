import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Daily counts of resolved Deadlines/Tasks over the trailing `days` window
 * (oldest first, today last), derived from `updated_at` as a completion-time
 * proxy — there's no dedicated `completed_at` column. Feeds MomentumCard's
 * sparkline; grounded in real fetched data, not fabricated.
 */
export function buildCompletionTrend(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): number[] {
  const todayStart = startOfDay(new Date());
  const buckets = new Array(days).fill(0) as number[];

  const record = (updatedAt: string) => {
    const diffDays = Math.round((todayStart - startOfDay(new Date(updatedAt))) / DAY_MS);
    const index = days - 1 - diffDays;
    if (index >= 0 && index < days) buckets[index] += 1;
  };

  for (const deadline of deadlines) {
    if (deadline.status === "Completed") record(deadline.updated_at);
  }
  for (const task of tasks) {
    if (task.status === "Done") record(task.updated_at);
  }

  return buckets;
}

export interface CompletedItem {
  id: string;
  kind: "deadline" | "task";
  title: string;
  at: Date;
  href: string;
}

/**
 * The actual rows behind buildCompletionTrend's counts, most-recent-first —
 * feeds MomentumCard's "what got done" breakdown list. Same trailing-window
 * and updated_at-as-completion-proxy logic as buildCompletionTrend.
 */
export function buildCompletedThisWeek(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): CompletedItem[] {
  const todayStart = startOfDay(new Date());
  const isWithinWindow = (updatedAt: string) => {
    const diffDays = Math.round((todayStart - startOfDay(new Date(updatedAt))) / DAY_MS);
    return diffDays >= 0 && diffDays < days;
  };

  const items: CompletedItem[] = [];

  for (const deadline of deadlines) {
    if (deadline.status === "Completed" && isWithinWindow(deadline.updated_at)) {
      items.push({ id: deadline.id, kind: "deadline", title: deadline.title, at: new Date(deadline.updated_at), href: `/courses/deadlines/${deadline.id}` });
    }
  }
  for (const task of tasks) {
    if (task.status === "Done" && isWithinWindow(task.updated_at)) {
      items.push({ id: task.id, kind: "task", title: task.title, at: new Date(task.updated_at), href: `/board/${task.id}` });
    }
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function cycleTimeDays(createdAt: string, completedAt: string): number {
  return Math.max(0, (new Date(completedAt).getTime() - new Date(createdAt).getTime()) / DAY_MS);
}

/** Terminal-status + trailing-window predicate shared by every stat below —
 * same rule buildCompletionTrend/buildCompletedThisWeek already encode,
 * factored out so it isn't repeated four more times. */
function isCompletedWithin(
  status: string,
  terminalStatus: string,
  updatedAt: string,
  todayStart: number,
  windowStart: number,
  windowEnd: number,
): boolean {
  if (status !== terminalStatus) return false;
  const diffDays = Math.round((todayStart - startOfDay(new Date(updatedAt))) / DAY_MS);
  return diffDays >= windowStart && diffDays < windowEnd;
}

export interface CycleTimeStats {
  thisWeekAvgDays: number | null;
  lastWeekAvgDays: number | null;
  /** thisWeekAvgDays - lastWeekAvgDays; negative = faster. Null unless both sides have data. */
  deltaDays: number | null;
}

/**
 * Avg time from created_at to updated_at-at-completion, for items completed
 * this trailing window vs. the window immediately before it — the actual
 * "faster or slower" signal MomentumCard's headline stat needs, as opposed
 * to buildCompletionTrend's raw activity count.
 */
export function buildCycleTimeStats(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): CycleTimeStats {
  const todayStart = startOfDay(new Date());
  const thisWeek: number[] = [];
  const lastWeek: number[] = [];

  const bucket = (status: string, terminalStatus: string, createdAt: string, updatedAt: string) => {
    if (isCompletedWithin(status, terminalStatus, updatedAt, todayStart, 0, days)) {
      thisWeek.push(cycleTimeDays(createdAt, updatedAt));
    } else if (isCompletedWithin(status, terminalStatus, updatedAt, todayStart, days, days * 2)) {
      lastWeek.push(cycleTimeDays(createdAt, updatedAt));
    }
  };

  for (const deadline of deadlines) bucket(deadline.status, "Completed", deadline.created_at, deadline.updated_at);
  for (const task of tasks) bucket(task.status, "Done", task.created_at, task.updated_at);

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

  const record = (status: string, terminalStatus: string, updatedAt: string, dueAt: string | null) => {
    if (!isCompletedWithin(status, terminalStatus, updatedAt, todayStart, 0, days)) return;
    completedCount += 1;
    if (dueAt === null) return;
    eligibleCount += 1;
    if (new Date(updatedAt).getTime() <= new Date(dueAt).getTime()) onTimeCount += 1;
  };

  for (const deadline of deadlines) record(deadline.status, "Completed", deadline.updated_at, deadline.due_at);
  for (const task of tasks) record(task.status, "Done", task.updated_at, task.due_at);

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
    if (deadline.status === "Completed" && isWithinWindow(deadline.updated_at)) completedCount += 1;
    if (isWithinWindow(deadline.created_at)) createdCount += 1;
  }
  for (const task of tasks) {
    if (task.status === "Done" && isWithinWindow(task.updated_at)) completedCount += 1;
    if (isWithinWindow(task.created_at)) createdCount += 1;
  }

  return { delta: completedCount - createdCount, completedCount, createdCount };
}

/**
 * Same trailing-window/day-bucket contract as buildCompletionTrend, but each
 * bucket holds the avg cycle-time-in-days of items completed that day (0
 * when nothing completed) instead of a raw count — feeds MomentumCard's
 * sparkline once it plots speed instead of activity volume.
 */
export function buildCycleTimeSparkline(deadlines: DeadlineRow[], tasks: TaskRow[], days = 7): number[] {
  const todayStart = startOfDay(new Date());
  const sums = new Array(days).fill(0) as number[];
  const counts = new Array(days).fill(0) as number[];

  const record = (createdAt: string, updatedAt: string) => {
    const diffDays = Math.round((todayStart - startOfDay(new Date(updatedAt))) / DAY_MS);
    const index = days - 1 - diffDays;
    if (index >= 0 && index < days) {
      sums[index] += cycleTimeDays(createdAt, updatedAt);
      counts[index] += 1;
    }
  };

  for (const deadline of deadlines) {
    if (deadline.status === "Completed") record(deadline.created_at, deadline.updated_at);
  }
  for (const task of tasks) {
    if (task.status === "Done") record(task.created_at, task.updated_at);
  }

  return sums.map((sum, index) => (counts[index] === 0 ? 0 : sum / counts[index]));
}
