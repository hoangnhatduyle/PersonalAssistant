import type { DeadlineRow, TaskRow, TodoItemRow } from "@/lib/api/entity-types";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface StaleItem {
  id: string;
  kind: "deadline" | "task" | "todo";
  title: string;
  href: string;
  updatedAt: Date;
  daysSinceUpdate: number;
}

/**
 * Open items whose updated_at is older than `staleAfterDays` — the same
 * updated_at-as-proxy convention buildCompletedThisWeek uses for "done",
 * inverted for "neglected." Only open/incomplete items qualify (mirrors
 * isOpenDeadline/isOpenTask/!is_done): a stale Completed/Done/Cancelled item
 * isn't "at risk," it's resolved work that's meant to be left alone.
 */
export function buildStaleItems(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  staleAfterDays = 7,
  now: Date = new Date(),
): StaleItem[] {
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
      href: `/deadlines/${deadline.id}`,
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
      href: `/tasks/${task.id}`,
      updatedAt: new Date(task.updated_at),
      daysSinceUpdate,
    });
  }

  for (const item of todoItems) {
    if (item.is_done) continue;
    const daysSinceUpdate = daysSince(item.updated_at);
    if (daysSinceUpdate < staleAfterDays) continue;
    items.push({
      id: item.id,
      kind: "todo",
      title: item.title,
      href: "/courses/todos",
      updatedAt: new Date(item.updated_at),
      daysSinceUpdate,
    });
  }

  return items.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}
