import type { DeadlineRow, DeadlineStatus, TaskRow, TaskStatus, ReminderRow, TodoItemRow } from "@/lib/api/entity-types";

export type UpcomingItemKind = "deadline" | "task" | "reminder" | "todo";

export type TimeWindowFilter = "today" | "tomorrow" | "3days" | "7days" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

function localDayOffset(itemAt: Date, now: Date): number {
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOf(itemAt) - startOf(now)) / DAY_MS);
}

export interface UpcomingItem {
  id: string;
  kind: UpcomingItemKind;
  title: string;
  at: Date;
  href: string | null;
  /** Overdue deadlines and Delivered reminders need action now, not "soon". */
  urgent: boolean;
}

export function isOpenDeadline(status: DeadlineStatus): boolean {
  return status !== "Completed" && status !== "Cancelled";
}

export function isOpenTask(status: TaskStatus): boolean {
  return status === "Open";
}

interface BuildUpcomingItemsInput {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  reminders?: ReminderRow[];
  todoItems?: TodoItemRow[];
}

/**
 * Merges the three entity types dashboard widgets draw from into one
 * ascending-sorted timeline. No `/api/dashboard` route exists — this
 * composes already-fetched, already-cached list data client-side.
 */
export function buildUpcomingItems({ deadlines, tasks, reminders = [], todoItems = [] }: BuildUpcomingItemsInput): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  const now = Date.now();

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    const at = new Date(deadline.due_at);
    items.push({
      id: deadline.id,
      kind: "deadline",
      title: deadline.title,
      at,
      href: `/deadlines/${deadline.id}`,
      // Overdue status is the authoritative signal, but a due_at that's
      // slipped past "now" without the status catching up yet (a lag this
      // codebase already accounts for elsewhere — see MomentumCard's
      // nearestDeadline comment) should still read as past due.
      urgent: deadline.status === "Overdue" || at.getTime() < now,
    });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    const at = new Date(task.due_at);
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      at,
      href: `/tasks/${task.id}`,
      urgent: at.getTime() < now,
    });
  }

  // toISOString().slice(0, 10) reads the UTC calendar day, not the user's
  // local one — in the evening in any timezone behind UTC, that's already
  // "tomorrow" in UTC, which wrongly marked today's items as past due
  // (urgent). Build the date key from local getFullYear/getMonth/getDate
  // instead, matching due_date's own local-calendar-day semantics.
  const todayLocal = new Date();
  const today = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;

  for (const item of todoItems) {
    if (item.is_done || !item.due_date) continue;
    // due_date is a calendar day (YYYY-MM-DD), not an instant — compare dates
    // like CourseTodoListCard, and use end-of-local-day for sorting/relative time.
    const at = new Date(`${item.due_date}T23:59:59.999`);
    items.push({
      id: item.id,
      kind: "todo",
      title: item.title,
      at,
      href: "/courses/todos",
      urgent: item.due_date < today,
    });
  }

  if (reminders.length > 0) {
    const deadlineTitleById = new Map(deadlines.map((deadline) => [deadline.id, deadline.title]));
    const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]));

    for (const reminder of reminders) {
      // A Snoozed reminder's next-relevant time is snooze_until, not its
      // original (now-past) trigger_at.
      const at =
        reminder.acknowledgment_state === "Snoozed" && reminder.snooze_until ? reminder.snooze_until : reminder.trigger_at;
      const title =
        (reminder.target_type === "deadline" ? deadlineTitleById.get(reminder.target_id) : taskTitleById.get(reminder.target_id)) ??
        "Reminder";

      items.push({
        id: reminder.id,
        kind: "reminder",
        title,
        at: new Date(at),
        href: null,
        urgent: reminder.acknowledgment_state === "Delivered",
      });
    }
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Narrows a sorted upcoming-items list to a calendar-day window relative to `now`. */
export function filterUpcomingItemsByTimeWindow(items: UpcomingItem[], window: TimeWindowFilter, now: Date = new Date()): UpcomingItem[] {
  if (window === "all") return items;

  return items.filter((item) => {
    const offset = localDayOffset(item.at, now);
    switch (window) {
      case "today":
        return offset <= 0;
      case "tomorrow":
        return offset === 1;
      case "3days":
        return offset <= 2;
      case "7days":
        return offset <= 6;
      default:
        return true;
    }
  });
}
