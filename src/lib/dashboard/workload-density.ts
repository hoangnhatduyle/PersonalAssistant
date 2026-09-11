import type { AppointmentRow, CourseRow, DeadlineRow, TaskRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";
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
  /**
   * Deadline Sessions planned for this day. Tracked separately from
   * `total`/the stacked bar height — a Session is time the user already
   * blocked out for themselves, not an owed obligation, so it shouldn't
   * inflate the pile-up signal the bar height exists to convey.
   */
  sessionCount: number;
  total: number;
}

export interface DensityItem {
  id: string;
  kind: "deadline" | "task" | "todo" | "session";
  title: string;
  href: string;
  /** To-Do items only — the name of the list it belongs to. */
  listName?: string;
  /** To-Do items only — the course their list belongs to, when it has one. */
  courseName?: string;
  /** Tasks only. */
  tags?: string[];
}

export interface PastDueSummary {
  count: number;
  deadlineCount: number;
  taskCount: number;
  todoCount: number;
}

function isPastDue(dateKey: string, todayKey: string): boolean {
  return dateKey < todayKey;
}

/**
 * Buckets open Deadlines/Tasks/To-Do items (plus planned Deadline Sessions)
 * with a due date into a rolling `days`-day-ahead window (today..today+days-1),
 * local-calendar-day granularity. Items outside the window (overdue, or
 * further out) are dropped rather than folded into "today" —
 * DailyIntelligenceCard/NextSequenceQueue already surface overdue items,
 * this view is specifically about what's coming up.
 */
export function buildWorkloadDensity(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  appointments: AppointmentRow[] = [],
  days = 7,
  now: Date = new Date(),
): DensityDayBucket[] {
  const todayStart = startOfDay(now);
  const buckets: DensityDayBucket[] = Array.from({ length: days }, (_, dayOffset) => {
    const date = new Date(todayStart.getTime() + dayOffset * DAY_MS);
    return { date: toDateKey(date), dayOffset, deadlineCount: 0, taskCount: 0, todoCount: 0, sessionCount: 0, total: 0 };
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

  for (const appointment of appointments) {
    // Deadline Sessions: appointments rows tagged category "Session", same
    // convention as buildUpcomingItems. Only "planned" ones are actionable.
    if (appointment.category !== "Session" || appointment.session_status !== "planned") continue;
    if (appointment.date < todayKey) continue;
    const index = buckets.findIndex((bucket) => bucket.date === appointment.date);
    if (index === -1) continue;
    // Not added to `total` — see DensityDayBucket.sessionCount.
    buckets[index].sessionCount += 1;
  }

  return buckets;
}

/**
 * Counts open Deadlines/Tasks/To-Do items whose due date is before today —
 * the mirror image of `buildWorkloadDensity`'s window, which deliberately
 * drops these. Calendar-day granularity throughout, consistent with the
 * rest of this file (not the instant-based `urgent` flag `upcoming-items.ts`
 * uses for deadlines).
 */
export function countPastDueItems(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  now: Date = new Date(),
): PastDueSummary {
  const todayKey = toDateKey(startOfDay(now));

  let deadlineCount = 0;
  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    if (isPastDue(toDateKey(new Date(deadline.due_at)), todayKey)) deadlineCount += 1;
  }

  let taskCount = 0;
  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    if (isPastDue(toDateKey(new Date(task.due_at)), todayKey)) taskCount += 1;
  }

  let todoCount = 0;
  for (const item of todoItems) {
    if (item.is_done || !item.due_date) continue;
    if (isPastDue(item.due_date, todayKey)) todoCount += 1;
  }

  return { count: deadlineCount + taskCount + todoCount, deadlineCount, taskCount, todoCount };
}

/**
 * The raw items behind `countPastDueItems`' counts — same shape and
 * enrichment as `itemsForDensityDay`, feeding a "past due" expand/detail
 * view instead of a specific day's.
 */
export function pastDueItemsFor(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  todoLists: TodoListRow[] = [],
  courses: CourseRow[] = [],
  now: Date = new Date(),
): DensityItem[] {
  const todayKey = toDateKey(startOfDay(now));
  const items: DensityItem[] = [];

  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));
  const courseNameByListId = new Map(
    todoLists.filter((list) => list.course_id).map((list) => [list.id, courseNameById.get(list.course_id as string)]),
  );
  const listNameById = new Map(todoLists.map((list) => [list.id, list.name]));

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    if (!isPastDue(toDateKey(new Date(deadline.due_at)), todayKey)) continue;
    items.push({ id: deadline.id, kind: "deadline", title: deadline.title, href: `/deadlines/${deadline.id}` });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    if (!isPastDue(toDateKey(new Date(task.due_at)), todayKey)) continue;
    items.push({ id: task.id, kind: "task", title: task.title, href: `/tasks/${task.id}`, tags: task.tags });
  }

  for (const item of todoItems) {
    if (item.is_done || !item.due_date) continue;
    if (!isPastDue(item.due_date, todayKey)) continue;
    items.push({
      id: item.id,
      kind: "todo",
      title: item.title,
      href: "/courses/todos",
      listName: listNameById.get(item.list_id),
      courseName: courseNameByListId.get(item.list_id),
    });
  }

  return items;
}

/**
 * The raw items behind one bucket's counts — feeds a day's expand/detail
 * view. `todoLists`/`courses` are optional and used to resolve a To-Do
 * item's list name and, when the list belongs to one, its course name
 * (mirrors NextSequenceQueue's courseName enrichment, which likewise only
 * applies to todos, not deadlines).
 */
export function itemsForDensityDay(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoItems: TodoItemRow[] = [],
  date: string,
  todoLists: TodoListRow[] = [],
  courses: CourseRow[] = [],
  appointments: AppointmentRow[] = [],
): DensityItem[] {
  const items: DensityItem[] = [];

  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));
  const courseNameByListId = new Map(
    todoLists.filter((list) => list.course_id).map((list) => [list.id, courseNameById.get(list.course_id as string)]),
  );
  const listNameById = new Map(todoLists.map((list) => [list.id, list.name]));

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    if (toDateKey(new Date(deadline.due_at)) !== date) continue;
    items.push({ id: deadline.id, kind: "deadline", title: deadline.title, href: `/deadlines/${deadline.id}` });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    if (toDateKey(new Date(task.due_at)) !== date) continue;
    items.push({ id: task.id, kind: "task", title: task.title, href: `/tasks/${task.id}`, tags: task.tags });
  }

  for (const item of todoItems) {
    if (item.is_done || item.due_date !== date) continue;
    items.push({
      id: item.id,
      kind: "todo",
      title: item.title,
      href: "/courses/todos",
      listName: listNameById.get(item.list_id),
      courseName: courseNameByListId.get(item.list_id),
    });
  }

  for (const appointment of appointments) {
    if (appointment.category !== "Session" || appointment.session_status !== "planned") continue;
    if (appointment.date !== date) continue;
    items.push({
      id: appointment.id,
      kind: "session",
      title: appointment.title,
      href: appointment.deadline_id ? `/deadlines/${appointment.deadline_id}` : "/calendar",
    });
  }

  return items;
}
