import type { AppointmentRow, CourseRow, DeadlineRow, ReminderRow, TaskRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

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
    priority: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeTodoItem(overrides: Partial<TodoItemRow> = {}): TodoItemRow {
  return {
    id: "todo-1",
    list_id: "list-1",
    title: "To-do item",
    due_date: "2026-01-04",
    is_done: false,
    position: 0,
    priority: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeCourse(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "c-1",
    code: "CS101",
    name: "Course",
    term: null,
    instructor: null,
    location: null,
    meeting_blocks: [],
    person_id: null,
    recurrence_start_date: null,
    recurrence_end_date: null,
    reminders_enabled: true,
    reminder_lead_minutes: 30,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeTodoList(overrides: Partial<TodoListRow> = {}): TodoListRow {
  return {
    id: "list-1",
    course_id: "c-1",
    name: "To-Do List",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    title: "Session",
    date: "2026-01-04",
    category: "Session",
    time: null,
    location: null,
    notes: [],
    reminders_enabled: false,
    reminder_lead_minutes: 60,
    deadline_id: "d-1",
    duration_minutes: 60,
    session_status: "planned",
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
