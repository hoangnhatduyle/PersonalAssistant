import { describe, expect, it } from "vitest";
import { formatDeadlineRecurrence, getFirstOccurrenceEndOfDay } from "@/lib/deadlines/recurrence";

// 2026-09-21 is a Monday. All cases use America/Chicago (UTC-5 in September,
// UTC-6 after the 2026-11-01 DST end) so the wall-clock-vs-UTC handling is real.
const TZ = "America/Chicago";
const MON = 1;
const WED = 3;
const FRI = 5;

describe("formatDeadlineRecurrence", () => {
  it("summarises days in week order with an optional end date", () => {
    expect(formatDeadlineRecurrence([5, 1, 3], null)).toBe("Repeats every Monday, Wednesday and Friday");
    expect(formatDeadlineRecurrence([2], "2026-12-11")).toBe("Repeats every Tuesday until 2026-12-11");
  });

  it("returns null when not recurring", () => {
    expect(formatDeadlineRecurrence([], null)).toBeNull();
  });
});

describe("getFirstOccurrenceEndOfDay", () => {
  // Mon 2026-09-21 10:00 CDT.
  const now = new Date("2026-09-21T15:00:00.000Z");

  it("returns end of today when today is a selected day", () => {
    expect(getFirstOccurrenceEndOfDay([MON, FRI], TZ, now)).toBe("2026-09-22T04:59:59.999Z"); // Mon 23:59:59.999 CDT
  });

  it("returns end of the next selected day when today isn't one", () => {
    expect(getFirstOccurrenceEndOfDay([WED], TZ, now)).toBe("2026-09-24T04:59:59.999Z"); // Wed 23:59:59.999 CDT
  });

  it("returns null with no days", () => {
    expect(getFirstOccurrenceEndOfDay([], TZ, now)).toBeNull();
  });
});
