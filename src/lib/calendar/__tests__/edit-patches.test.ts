import { describe, expect, it } from "vitest";
import { buildCalendarEdit, isMoveIntoPast, minutesToTimeKey } from "../edit-patches";

const DETROIT = "America/Detroit";

describe("minutesToTimeKey", () => {
  it("formats minutes-of-day as zero-padded 24-hour HH:MM", () => {
    expect(minutesToTimeKey(0)).toBe("00:00");
    expect(minutesToTimeKey(545)).toBe("09:05");
    expect(minutesToTimeKey(14 * 60 + 30)).toBe("14:30");
    expect(minutesToTimeKey(23 * 60 + 59)).toBe("23:59");
  });

  it("keeps the value inside the day", () => {
    expect(minutesToTimeKey(1440)).toBe("23:59");
    expect(minutesToTimeKey(-5)).toBe("00:00");
  });
});

describe("buildCalendarEdit", () => {
  it("writes an appointment's date, structured HH:MM time and duration", () => {
    const edit = buildCalendarEdit({ kind: "appointment", entityId: "a-1" }, { date: "2026-11-06", startMinutes: 930, endMinutes: 1020 }, DETROIT);
    expect(edit).toEqual({
      kind: "appointment",
      id: "a-1",
      body: { date: "2026-11-06", time: "15:30", duration_minutes: 90 },
      dueAt: null,
    });
  });

  it("writes a deadline's due_at as the instant the wall-clock time reads in the profile zone", () => {
    const edit = buildCalendarEdit({ kind: "deadline", entityId: "d-1" }, { date: "2026-11-10", startMinutes: 23 * 60 + 45, endMinutes: 24 * 60 + 30 }, DETROIT);
    // 11:45 PM EST (UTC-5) on Nov 10 -> 04:45Z on Nov 11. Only the start matters for a point marker.
    expect(edit).toEqual({
      kind: "deadline",
      id: "d-1",
      body: { due_at: "2026-11-11T04:45:00.000Z" },
      dueAt: "2026-11-11T04:45:00.000Z",
    });
  });

  it("does the same for a task", () => {
    const edit = buildCalendarEdit({ kind: "task", entityId: "t-1" }, { date: "2026-07-01", startMinutes: 9 * 60, endMinutes: 9 * 60 + 45 }, DETROIT);
    expect(edit?.body).toEqual({ due_at: "2026-07-01T13:00:00.000Z" }); // EDT, UTC-4
  });

  it("returns null for a kind the calendar can't edit directly", () => {
    expect(buildCalendarEdit({ kind: "course", entityId: "c-1" }, { date: "2026-11-06", startMinutes: 600, endMinutes: 660 }, DETROIT)).toBeNull();
    expect(buildCalendarEdit({ kind: "recurring-appointment", entityId: "a-r" }, { date: "2026-11-06", startMinutes: 600, endMinutes: 660 }, DETROIT)).toBeNull();
  });
});

describe("isMoveIntoPast", () => {
  const NOW = new Date("2026-11-06T12:00:00Z");

  it("is true when a deadline or task would be set to an instant before now", () => {
    expect(isMoveIntoPast({ kind: "deadline", id: "d", body: {}, dueAt: "2026-11-06T11:59:00.000Z" }, NOW)).toBe(true);
    expect(isMoveIntoPast({ kind: "task", id: "t", body: {}, dueAt: "2026-11-01T00:00:00.000Z" }, NOW)).toBe(true);
  });

  it("is false for a future due date", () => {
    expect(isMoveIntoPast({ kind: "deadline", id: "d", body: {}, dueAt: "2026-11-06T12:01:00.000Z" }, NOW)).toBe(false);
  });

  it("is false for an appointment — moving a one-off event into the past is just recording it", () => {
    expect(isMoveIntoPast({ kind: "appointment", id: "a", body: {}, dueAt: null }, NOW)).toBe(false);
  });
});
