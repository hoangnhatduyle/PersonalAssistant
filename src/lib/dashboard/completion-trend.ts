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
