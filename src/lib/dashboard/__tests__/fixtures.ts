import type { DeadlineRow, ReminderRow, TaskRow } from "@/lib/api/entity-types";

export function makeDeadline(overrides: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    id: "d-1",
    course_id: "c-1",
    title: "Deadline",
    due_at: "2026-01-05T00:00:00Z",
    priority: null,
    status: "Not Started",
    person_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t-1",
    title: "Task",
    due_at: "2026-01-04T00:00:00Z",
    status: "Open",
    tags: [],
    reminders_enabled: true,
    reminder_lead_minutes: 30,
    person_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeReminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "r-1",
    target_type: "deadline",
    target_id: "d-1",
    acknowledgment_state: "Delivered",
    channel: "email",
    trigger_at: "2026-01-03T00:00:00Z",
    delivered_at: "2026-01-03T00:00:00Z",
    emailed_at: null,
    snooze_until: null,
    created_at: "2026-01-01T00:00:00Z",
    user_id: "u-1",
    ...overrides,
  };
}
