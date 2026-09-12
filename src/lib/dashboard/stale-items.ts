import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface StaleItem {
  id: string;
  kind: "deadline" | "task";
  title: string;
  href: string;
  updatedAt: Date;
  daysSinceUpdate: number;
}

/**
 * Open items whose updated_at is older than `staleAfterDays` — the same
 * updated_at-as-proxy convention buildCompletedThisWeek uses for "done",
 * inverted for "neglected." Only open/incomplete items qualify (mirrors
 * isOpenDeadline/isOpenTask): a stale Completed/Done/Cancelled item isn't
 * "at risk," it's resolved work that's meant to be left alone.
 */
export function buildStaleItems(deadlines: DeadlineRow[], tasks: TaskRow[], staleAfterDays = 7, now: Date = new Date()): StaleItem[] {
  const todayStart = startOfDay(now);
  const items: StaleItem[] = [];

  const daysSince = (updatedAt: string) => Math.round((todayStart - startOfDay(new Date(updatedAt))) / DAY_MS);

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    const daysSinceUpdate = daysSince(deadline.updated_at);
    if (daysSinceUpdate < staleAfterDays) continue;
    items.push({
      id: deadline.id,
      kind: "deadline",
      title: deadline.title,
      href: `/courses/deadlines/${deadline.id}`,
      updatedAt: new Date(deadline.updated_at),
      daysSinceUpdate,
    });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status)) continue;
    const daysSinceUpdate = daysSince(task.updated_at);
    if (daysSinceUpdate < staleAfterDays) continue;
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      href: `/board/${task.id}`,
      updatedAt: new Date(task.updated_at),
      daysSinceUpdate,
    });
  }

  return items.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}
