import { describe, expect, it } from "vitest";
import { findCourseConflictingAppointmentIds } from "../course-conflicts";
import type { AppointmentRow, CourseRow } from "@/lib/api/entity-types";

function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    title: "Event",
    // 2026-01-05 is a Monday.
    date: "2026-01-05",
    category: "Personal",
    time: "11:00",
    location: null,
    notes: [],
    reminders_enabled: false,
    reminder_lead_minutes: 60,
    deadline_id: null,
    duration_minutes: 60,
    session_status: null,
    event_status: "planned",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

function makeCourse(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "course-1",
    name: "Algorithms",
    code: null,
    term: null,
    // Monday, 11:15 AM - 12:20 PM.
    meeting_blocks: [{ days: [1], startMinutes: 11 * 60 + 15, endMinutes: 12 * 60 + 20 }],
    recurrence_start_date: null,
    recurrence_end_date: null,
    location: null,
    instructor: null,
    reminders_enabled: false,
    reminder_lead_minutes: 60,
    person_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

describe("findCourseConflictingAppointmentIds", () => {
  it("flags an appointment overlapping a course meeting block on a matching weekday", () => {
    const ids = findCourseConflictingAppointmentIds(
      [makeAppointment({ id: "a", date: "2026-01-05", time: "11:00", duration_minutes: 60 })],
      [makeCourse()],
    );
    expect(ids).toEqual(new Set(["a"]));
  });

  it("does not flag an appointment on a non-meeting weekday", () => {
    // 2026-01-06 is a Tuesday; the course only meets Mondays.
    const ids = findCourseConflictingAppointmentIds(
      [makeAppointment({ id: "a", date: "2026-01-06", time: "11:00", duration_minutes: 60 })],
      [makeCourse()],
    );
    expect(ids.size).toBe(0);
  });

  it("does not flag an appointment outside the course's recurrence date range", () => {
    const ids = findCourseConflictingAppointmentIds(
      [makeAppointment({ id: "a", date: "2026-01-05", time: "11:00", duration_minutes: 60 })],
      [makeCourse({ recurrence_start_date: "2026-02-01", recurrence_end_date: "2026-05-01" })],
    );
    expect(ids.size).toBe(0);
  });

  it("does not flag back-to-back (touching endpoints)", () => {
    const ids = findCourseConflictingAppointmentIds(
      [makeAppointment({ id: "a", date: "2026-01-05", time: "12:20", duration_minutes: 30 })],
      [makeCourse()],
    );
    expect(ids.size).toBe(0);
  });

  it("does not flag a conflict against a tracked Person's course (People feature), only the owner's own", () => {
    const ids = findCourseConflictingAppointmentIds(
      [makeAppointment({ id: "a", date: "2026-01-05", time: "11:00", duration_minutes: 60 })],
      [makeCourse({ person_id: "person-1" })],
    );
    expect(ids.size).toBe(0);
  });

  it("skips an appointment with an unparseable time or a missing duration", () => {
    const ids = findCourseConflictingAppointmentIds(
      [
        makeAppointment({ id: "a", time: "Starting at 11:00 AM", duration_minutes: 60 }),
        makeAppointment({ id: "b", time: "11:00", duration_minutes: null }),
      ],
      [makeCourse()],
    );
    expect(ids.size).toBe(0);
  });
});
