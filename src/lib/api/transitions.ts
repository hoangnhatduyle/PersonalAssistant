import type { Database } from "@/lib/supabase/types";

type DeadlineStatus = Database["public"]["Enums"]["deadline_status"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type ReminderStatus = Database["public"]["Enums"]["reminder_status"];

export type DeadlineTransitionEvent = "user_marks_in_progress" | "user_marks_submitted" | "user_confirms_done" | "user_cancels";
export type TaskTransitionEvent = "user_marks_done" | "user_cancels";
export type ReminderTransitionEvent = "user_acknowledges" | "user_dismisses" | "user_snoozes";

// Mirrors SPEC-CORE-005's deadline_assignment machine, restricted to the
// user-initiated events (due_date_passed_incomplete is system-driven, fired
// by Item 4's dispatch sweep, not exposed through this route).
const deadlineTransitions: Record<DeadlineTransitionEvent, Partial<Record<DeadlineStatus, DeadlineStatus>>> = {
  user_marks_in_progress: { "Not Started": "In Progress" },
  user_marks_submitted: { "In Progress": "Submitted", Overdue: "Submitted" },
  user_confirms_done: { Submitted: "Completed" },
  user_cancels: { "Not Started": "Cancelled", "In Progress": "Cancelled" },
};

// Mirrors SPEC-CORE-005's task_lifecycle machine.
const taskTransitions: Record<TaskTransitionEvent, Partial<Record<TaskStatus, TaskStatus>>> = {
  user_marks_done: { Open: "Done" },
  user_cancels: { Open: "Cancelled" },
};

// Mirrors SPEC-CORE-005's reminder machine, restricted to the user-initiated
// events (trigger_time_reached/snooze_time_reached/no_response_timeout are
// system-driven, fired by Item 4's dispatch sweep; target_soft_deleted is
// fired by the DB trigger). All three only apply from Delivered, which is
// exactly SPEC-API-004 AC-5's requirement.
const reminderTransitions: Record<ReminderTransitionEvent, Partial<Record<ReminderStatus, ReminderStatus>>> = {
  user_acknowledges: { Delivered: "Acknowledged" },
  user_dismisses: { Delivered: "Dismissed" },
  user_snoozes: { Delivered: "Snoozed" },
};

/**
 * NC-API-002/AC-2: state fields may only change through an explicit,
 * validated transition event — never an arbitrary value via a generic
 * update. Returns the resulting status, or null if `event` does not apply
 * from `currentStatus` (caller rejects with an error envelope; the DB
 * transition-guard trigger is the backstop if this check is ever bypassed).
 */
export function resolveDeadlineTransition(
  event: DeadlineTransitionEvent,
  currentStatus: DeadlineStatus,
): DeadlineStatus | null {
  return deadlineTransitions[event]?.[currentStatus] ?? null;
}

export function resolveTaskTransition(event: TaskTransitionEvent, currentStatus: TaskStatus): TaskStatus | null {
  return taskTransitions[event]?.[currentStatus] ?? null;
}

export function resolveReminderTransition(event: ReminderTransitionEvent, currentStatus: ReminderStatus): ReminderStatus | null {
  return reminderTransitions[event]?.[currentStatus] ?? null;
}

export function isDeadlineTransitionEvent(value: string): value is DeadlineTransitionEvent {
  return value in deadlineTransitions;
}

export function isTaskTransitionEvent(value: string): value is TaskTransitionEvent {
  return value in taskTransitions;
}

export function isReminderTransitionEvent(value: string): value is ReminderTransitionEvent {
  return value in reminderTransitions;
}

/**
 * UI transition-gating: which events are legal from the current status, so a
 * transition-menu component can render only valid actions instead of a raw
 * status dropdown. Derived from the exact same tables the server enforces
 * above (this file has no server-only imports, so it's safe to import from
 * client components too) — a single source of truth, not a second copy that
 * could drift from what the server actually accepts.
 */
export function getValidDeadlineEvents(status: DeadlineStatus): DeadlineTransitionEvent[] {
  return (Object.keys(deadlineTransitions) as DeadlineTransitionEvent[]).filter(
    (event) => deadlineTransitions[event]?.[status] !== undefined,
  );
}

export function getValidTaskEvents(status: TaskStatus): TaskTransitionEvent[] {
  return (Object.keys(taskTransitions) as TaskTransitionEvent[]).filter(
    (event) => taskTransitions[event]?.[status] !== undefined,
  );
}

export function getValidReminderEvents(status: ReminderStatus): ReminderTransitionEvent[] {
  return (Object.keys(reminderTransitions) as ReminderTransitionEvent[]).filter(
    (event) => reminderTransitions[event]?.[status] !== undefined,
  );
}
