import type { DeadlineRow, TaskRow, TodoItemRow } from "@/lib/api/entity-types";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface DensityDayBucket {
  /** Local calendar date, "YYYY-MM-DD" */
  date: string;
  /** 0 = today */
  dayOffset: number;
  deadlineCount: number;
  taskCount: number;
  todoCount: number;
  total: number;
}

export interface DensityItem {
  id: string;
  kind: "deadline" | "task" | "todo";
  title: string;
  href: string;
}

/**
 * Buckets open Deadlines/Tasks/To-Do items with a due date into a rolling
 * `days`-day-ahead window (today..today+days-1), local-calendar-day
 * granularity. Items outside the window (overdue, or further out) are
 * dropped rather than folded into "today" — SuggestionBanner/NextSequenceQueue
 * already surface overdue items, this view is specifically about what's
 * coming up.
 */
export function buildWorkloadDensity(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  days = 7,
  now: Date = new Date(),
): DensityDayBucket[] {
  const todayStart = startOfDay(now);
  const buckets: DensityDayBucket[] = Array.from({ length: days }, (_, dayOffset) => {
    const date = new Date(todayStart.getTime() + dayOffset * DAY_MS);
    return { date: toDateKey(date), dayOffset, deadlineCount: 0, taskCount: 0, todoCount: 0, total: 0 };
  });

  const dayOffsetFor = (at: Date) => Math.round((startOfDay(at).getTime() - todayStart.getTime()) / DAY_MS);

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    const offset = dayOffsetFor(new Date(deadline.due_at));
    if (offset < 0 || offset >= days) continue;
    buckets[offset].deadlineCount += 1;
    buckets[offset].total += 1;
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    const offset = dayOffsetFor(new Date(task.due_at));
    if (offset < 0 || offset >= days) continue;
    buckets[offset].taskCount += 1;
    buckets[offset].total += 1;
  }

  const todayKey = toDateKey(todayStart);
  for (const item of todoItems) {
    if (item.is_done || !item.due_date) continue;
    // due_date is a calendar day (YYYY-MM-DD), not an instant — compare the
    // string directly, same convention buildUpcomingItems uses for todos.
    if (item.due_date < todayKey) continue;
    const index = buckets.findIndex((bucket) => bucket.date === item.due_date);
    if (index === -1) continue;
    buckets[index].todoCount += 1;
    buckets[index].total += 1;
  }

  return buckets;
}

/** The raw items behind one bucket's counts — feeds a day's expand/detail view. */
export function itemsForDensityDay(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  date: string,
): DensityItem[] {
  const items: DensityItem[] = [];

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    if (toDateKey(new Date(deadline.due_at)) !== date) continue;
    items.push({ id: deadline.id, kind: "deadline", title: deadline.title, href: `/deadlines/${deadline.id}` });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    if (toDateKey(new Date(task.due_at)) !== date) continue;
    items.push({ id: task.id, kind: "task", title: task.title, href: `/tasks/${task.id}` });
  }

  for (const item of todoItems) {
    if (item.is_done || item.due_date !== date) continue;
    items.push({ id: item.id, kind: "todo", title: item.title, href: "/courses/todos" });
  }

  return items;
}
