import type { CourseRow, DeadlineRow } from "@/lib/api/entity-types";

export function makeCourse(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "c-1",
    name: "Algorithms",
    code: null,
    term: null,
    meeting_pattern: null,
    location: null,
    instructor: null,
    reminders_enabled: true,
    reminder_lead_minutes: 60,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

export function makeDeadline(overrides: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    id: "d-1",
    course_id: "c-1",
    title: "Deadline",
    due_at: "2026-01-05T00:00:00Z",
    priority: null,
    status: "Not Started",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}
