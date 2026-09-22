import { describe, expect, it } from "vitest";
import { findConflictingAppointmentIds } from "../conflicts";
import type { AppointmentRow } from "@/lib/api/entity-types";

function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    title: "Event",
    date: "2026-01-04",
    category: "Personal",
    time: "14:00",
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

describe("findConflictingAppointmentIds", () => {
  // parseTimeToMinutes's own parsing cases (24-hour, 12-hour AM/PM, malformed)
  // live in src/lib/calendar/__tests__/recurrence.test.ts. These cases prove
  // the AM/PM case is actually wired through end-to-end here, not just
  // parseable in isolation -- this is the exact class of bug that shipped:
  // a "7:00 PM" appointment used to silently disable conflict detection.
  it("flags an overlap between two AM/PM-formatted times", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "7:00 PM", duration_minutes: 60 }),
      makeAppointment({ id: "b", time: "7:30 PM", duration_minutes: 60 }),
    ]);
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("does not flag non-overlapping AM/PM-formatted times", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "7:00 AM", duration_minutes: 30 }),
      makeAppointment({ id: "b", time: "7:00 PM", duration_minutes: 30 }),
    ]);
    expect(ids.size).toBe(0);
  });


  it("flags two appointments with an exact overlap", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "14:00", duration_minutes: 60 }),
      makeAppointment({ id: "b", time: "14:00", duration_minutes: 60 }),
    ]);
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("flags a partial overlap", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "14:00", duration_minutes: 60 }),
      makeAppointment({ id: "b", time: "14:30", duration_minutes: 60 }),
    ]);
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("does not flag back-to-back appointments (touching endpoints)", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "14:00", duration_minutes: 60 }),
      makeAppointment({ id: "b", time: "15:00", duration_minutes: 30 }),
    ]);
    expect(ids.size).toBe(0);
  });

  it("does not flag non-overlapping appointments on the same day", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "09:00", duration_minutes: 30 }),
      makeAppointment({ id: "b", time: "14:00", duration_minutes: 30 }),
    ]);
    expect(ids.size).toBe(0);
  });

  it("never flags overlapping times on different dates", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", date: "2026-01-04", time: "14:00", duration_minutes: 60 }),
      makeAppointment({ id: "b", date: "2026-01-05", time: "14:00", duration_minutes: 60 }),
    ]);
    expect(ids.size).toBe(0);
  });

  it("skips appointments with an unparseable time or a missing duration, without flagging either side", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "14:00", duration_minutes: 60 }),
      makeAppointment({ id: "session", time: "Starting at 2:00 PM", duration_minutes: 60 }),
      makeAppointment({ id: "no-duration", time: "14:00", duration_minutes: null }),
    ]);
    expect(ids.size).toBe(0);
  });

  it("flags all three ids when three appointments mutually overlap", () => {
    const ids = findConflictingAppointmentIds([
      makeAppointment({ id: "a", time: "14:00", duration_minutes: 90 }),
      makeAppointment({ id: "b", time: "14:30", duration_minutes: 30 }),
      makeAppointment({ id: "c", time: "15:00", duration_minutes: 30 }),
    ]);
    expect(ids).toEqual(new Set(["a", "b", "c"]));
  });
});
