import type { AppointmentRow, CourseRow, DeadlineRow, TaskRow, TodoListRow } from "@/lib/api/entity-types";
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
  kind: "deadline" | "task" | "session";
  title: string;
  href: string;
  /** Task (Board Card) only — the name of the Board List it belongs to, when it's in one. */
  listName?: string;
  /** Task (Board Card) only — the course that list belongs to, when it has one. */
  courseName?: string;
  /** Tasks only. */
  tags?: string[];
}

export interface PastDueSummary {
  count: number;
  deadlineCount: number;
  taskCount: number;
}

function isPastDue(dateKey: string, todayKey: string): boolean {
  return dateKey < todayKey;
}

/**
 * Buckets open Deadlines/Tasks (plus planned Deadline Sessions) with a due
 * date into a rolling `days`-day-ahead window (today..today+days-1),
 * local-calendar-day granularity. Items outside the window (overdue, or
 * further out) are dropped rather than folded into "today" —
 * DailyIntelligenceCard/NextSequenceQueue already surface overdue items,
 * this view is specifically about what's coming up.
 */
export function buildWorkloadDensity(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  appointments: AppointmentRow[] = [],
  days = 7,
  now: Date = new Date(),
): DensityDayBucket[] {
  const todayStart = startOfDay(now);
  const buckets: DensityDayBucket[] = Array.from({ length: days }, (_, dayOffset) => {
    const date = new Date(todayStart.getTime() + dayOffset * DAY_MS);
    return { date: toDateKey(date), dayOffset, deadlineCount: 0, taskCount: 0, sessionCount: 0, total: 0 };
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
 * Counts open Deadlines/Tasks whose due date is before today — the mirror
 * image of `buildWorkloadDensity`'s window, which deliberately drops these.
 * Calendar-day granularity throughout, consistent with the rest of this
 * file (not the instant-based `urgent` flag `upcoming-items.ts` uses for
 * deadlines).
 */
export function countPastDueItems(deadlines: DeadlineRow[], tasks: TaskRow[], now: Date = new Date()): PastDueSummary {
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

  return { count: deadlineCount + taskCount, deadlineCount, taskCount };
}

/**
 * The raw items behind `countPastDueItems`' counts — same shape and
 * enrichment as `itemsForDensityDay`, feeding a "past due" expand/detail
 * view instead of a specific day's.
 */
export function pastDueItemsFor(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
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
    items.push({ id: deadline.id, kind: "deadline", title: deadline.title, href: `/courses/deadlines/${deadline.id}` });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    if (!isPastDue(toDateKey(new Date(task.due_at)), todayKey)) continue;
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      href: `/board/${task.id}`,
      tags: task.tags,
      // Board merge: a Task can now belong to a Board List (list_id) the
      // same way a Course To-Do item used to belong to a todo_lists row.
      listName: task.list_id ? listNameById.get(task.list_id) : undefined,
      courseName: task.list_id ? courseNameByListId.get(task.list_id) : undefined,
    });
  }

  return items;
}

/**
 * The raw items behind one bucket's counts — feeds a day's expand/detail
 * view. `todoLists`/`courses` are optional and used to resolve a Task's
 * Board List name and, when the list belongs to one, its course name
 * (mirrors NextSequenceQueue's courseName enrichment, which likewise only
 * applies to listed Tasks, not deadlines).
 */
export function itemsForDensityDay(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
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
    items.push({ id: deadline.id, kind: "deadline", title: deadline.title, href: `/courses/deadlines/${deadline.id}` });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    if (toDateKey(new Date(task.due_at)) !== date) continue;
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      href: `/board/${task.id}`,
      tags: task.tags,
      listName: task.list_id ? listNameById.get(task.list_id) : undefined,
      courseName: task.list_id ? courseNameByListId.get(task.list_id) : undefined,
    });
  }

  for (const appointment of appointments) {
    if (appointment.category !== "Session" || appointment.session_status !== "planned") continue;
    if (appointment.date !== date) continue;
    items.push({
      id: appointment.id,
      kind: "session",
      title: appointment.title,
      href: appointment.deadline_id ? `/courses/deadlines/${appointment.deadline_id}` : "/calendar",
    });
  }

  return items;
}
