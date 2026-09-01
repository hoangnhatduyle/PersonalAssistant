import type { DeadlineRow, DeadlineStatus, TaskRow, TaskStatus, ReminderRow, TodoItemRow } from "@/lib/api/entity-types";

export type UpcomingItemKind = "deadline" | "task" | "reminder" | "todo";

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

  for (const item of todoItems) {
    if (item.is_done || !item.due_date) continue;
    const at = new Date(item.due_date);
    items.push({
      id: item.id,
      kind: "todo",
      title: item.title,
      at,
      href: "/courses/todos",
      urgent: at.getTime() < now,
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
