import { describe, expect, it } from "vitest";
import { isPastAppointment, matchesSearch, paginate } from "../list-view";
import type { AppointmentRow } from "@/lib/api/entity-types";

function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    title: "Event",
    date: "2026-09-20",
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

// Local-time constructor — the list formats/compares in the browser's timezone.
const at = (hour: number, minute = 0) => new Date(2026, 8, 20, hour, minute);

describe("isPastAppointment", () => {
  it("is past once start + duration has elapsed", () => {
    const appt = makeAppointment({ time: "14:00", duration_minutes: 60 });
    expect(isPastAppointment(appt, at(15, 1))).toBe(true);
  });

  it("is not past while in progress", () => {
    const appt = makeAppointment({ time: "14:00", duration_minutes: 60 });
    expect(isPastAppointment(appt, at(14, 30))).toBe(false);
  });

  it("is past at the exact end instant", () => {
    const appt = makeAppointment({ time: "14:00", duration_minutes: 60 });
    expect(isPastAppointment(appt, at(15, 0))).toBe(true);
  });

  it("is not past before it starts", () => {
    const appt = makeAppointment({ time: "14:00", duration_minutes: 60 });
    expect(isPastAppointment(appt, at(9))).toBe(false);
  });

  it("treats a missing duration as ending at its start", () => {
    const appt = makeAppointment({ time: "14:00", duration_minutes: null });
    expect(isPastAppointment(appt, at(14, 1))).toBe(true);
  });

  it("stays upcoming for the whole day when time is free text or missing", () => {
    const freeText = makeAppointment({ time: "Starting at 7:00 PM", duration_minutes: null });
    const noTime = makeAppointment({ time: null, duration_minutes: null });
    expect(isPastAppointment(freeText, at(23, 30))).toBe(false);
    expect(isPastAppointment(noTime, at(23, 30))).toBe(false);
    expect(isPastAppointment(noTime, new Date(2026, 8, 21, 0, 0))).toBe(true);
  });

  it("is past for an earlier date and upcoming for a later date", () => {
    expect(isPastAppointment(makeAppointment({ date: "2026-09-19" }), at(0, 1))).toBe(true);
    expect(isPastAppointment(makeAppointment({ date: "2026-09-21" }), at(23, 59))).toBe(false);
  });

  it("keeps a recurring appointment upcoming while its range is open or still running", () => {
    const openEnded = makeAppointment({ meeting_blocks: [{ days: [1], startMinutes: 540, endMinutes: 600 }] });
    const running = makeAppointment({
      meeting_blocks: [{ days: [1], startMinutes: 540, endMinutes: 600 }],
      recurrence_end_date: "2026-09-20",
    });
    expect(isPastAppointment(openEnded, at(12))).toBe(false);
    expect(isPastAppointment(running, at(23, 59))).toBe(false);
  });

  it("marks a recurring appointment past once its recurrence_end_date has passed", () => {
    const ended = makeAppointment({
      meeting_blocks: [{ days: [1], startMinutes: 540, endMinutes: 600 }],
      recurrence_end_date: "2026-09-19",
    });
    expect(isPastAppointment(ended, at(12))).toBe(true);
  });
});

describe("matchesSearch", () => {
  const appt = makeAppointment({
    title: "Job Search Webinar",
    category: "Career",
    location: "Microsoft Teams",
    date: "2026-09-21",
    event_status: "planned",
  });

  it("matches everything for an empty or whitespace query", () => {
    expect(matchesSearch(appt, "")).toBe(true);
    expect(matchesSearch(appt, "   ")).toBe(true);
  });

  it("matches title, category, location, and status case-insensitively", () => {
    expect(matchesSearch(appt, "webinar")).toBe(true);
    expect(matchesSearch(appt, "CAREER")).toBe(true);
    expect(matchesSearch(appt, "teams")).toBe(true);
    expect(matchesSearch(appt, "planned")).toBe(true);
  });

  it("matches the displayed date and the ISO date", () => {
    expect(matchesSearch(appt, "2026-09-21")).toBe(true);
    expect(matchesSearch(appt, "sep 21")).toBe(true);
  });

  it("requires every whitespace-separated token to match, in any order", () => {
    expect(matchesSearch(appt, "teams job")).toBe(true);
    expect(matchesSearch(appt, "job hackathon")).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(matchesSearch(appt, "workshop")).toBe(false);
  });

  it("tolerates null location and status", () => {
    const bare = makeAppointment({ location: null, event_status: null });
    expect(matchesSearch(bare, "event")).toBe(true);
    expect(matchesSearch(bare, "null")).toBe(false);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("returns the requested page slice with range metadata", () => {
    const result = paginate(items, 2, 10);
    expect(result.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result).toMatchObject({ page: 2, totalPages: 3, total: 25, rangeStart: 11, rangeEnd: 20 });
  });

  it("returns a short final page", () => {
    const result = paginate(items, 3, 10);
    expect(result.items).toEqual([21, 22, 23, 24, 25]);
    expect(result).toMatchObject({ rangeStart: 21, rangeEnd: 25 });
  });

  it("clamps an out-of-range page (e.g. after deleting the last row of the last page)", () => {
    expect(paginate(items, 9, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it("handles an empty list as one empty page", () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1, total: 0, rangeStart: 0, rangeEnd: 0 });
  });
});
