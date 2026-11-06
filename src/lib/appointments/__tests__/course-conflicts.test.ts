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
    meeting_blocks: [],
    recurrence_start_date: null,
    recurrence_end_date: null,
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

  it("flags an AM/PM-formatted appointment time overlapping a course meeting block", () => {
    const ids = findCourseConflictingAppointmentIds(
      [makeAppointment({ id: "a", date: "2026-01-05", time: "11:00 AM", duration_minutes: 60 })],
      [makeCourse()],
    );
    expect(ids).toEqual(new Set(["a"]));
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

  describe("with per-date exceptions to the course", () => {
    // The Monday 11:15-12:20 class on 2026-01-05; the appointment is 11:00-12:00 that day (a conflict).
    const classOverride = (fields: Partial<NonNullable<CourseRow["occurrence_overrides"]>[number]>) => ({
      original_date: "2026-01-05",
      original_start_minutes: 11 * 60 + 15,
      is_cancelled: false,
      new_date: "2026-01-05",
      new_start_minutes: 13 * 60,
      new_end_minutes: 15 * 60,
      ...fields,
    });

    it("still conflicts with the ordinary class (baseline)", () => {
      expect(findCourseConflictingAppointmentIds([makeAppointment()], [makeCourse()]).has("appt-1")).toBe(true);
    });

    it("stops conflicting once that day's class is cancelled", () => {
      const cancelled = makeCourse({
        occurrence_overrides: [classOverride({ is_cancelled: true, new_date: null, new_start_minutes: null, new_end_minutes: null })],
      });
      expect(findCourseConflictingAppointmentIds([makeAppointment()], [cancelled]).size).toBe(0);
    });

    it("stops conflicting when the class is shortened to start after the appointment (the half day off)", () => {
      const halfDay = makeCourse({ occurrence_overrides: [classOverride({})] });
      expect(findCourseConflictingAppointmentIds([makeAppointment()], [halfDay]).size).toBe(0);
      // ...but an appointment during the new, later hours does conflict.
      expect(findCourseConflictingAppointmentIds([makeAppointment({ time: "13:30" })], [halfDay]).has("appt-1")).toBe(true);
    });

    it("does not change the following week's class", () => {
      const halfDay = makeCourse({ occurrence_overrides: [classOverride({})] });
      const nextMonday = makeAppointment({ date: "2026-01-12" }); // 11:00-12:00, class 11:15-12:20
      expect(findCourseConflictingAppointmentIds([nextMonday], [halfDay]).has("appt-1")).toBe(true);
    });

    it("conflicts on a day the class was moved onto", () => {
      const movedToTuesday = makeCourse({
        occurrence_overrides: [classOverride({ new_date: "2026-01-06", new_start_minutes: 11 * 60, new_end_minutes: 12 * 60 })],
      });
      const tuesdayMorning = makeAppointment({ id: "appt-2", date: "2026-01-06", time: "11:30" });
      expect(findCourseConflictingAppointmentIds([tuesdayMorning], [movedToTuesday]).has("appt-2")).toBe(true);
    });
  });
});
