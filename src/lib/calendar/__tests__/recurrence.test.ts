import { describe, expect, it } from "vitest";
import { expandBlockInWeek, getNextOccurrence, formatBlocksSummary, formatMinutesOfDay } from "../recurrence";
import { makeMeetingBlock } from "./fixtures";

// Sun 2026-01-04 .. Sat 2026-01-10 (exclusive end).
const WEEK_START = new Date(2026, 0, 4);
const WEEK_END = new Date(2026, 0, 11);

describe("formatMinutesOfDay", () => {
  it("formats on-the-hour and mid-hour times", () => {
    expect(formatMinutesOfDay(9 * 60)).toBe("9 AM");
    expect(formatMinutesOfDay(13 * 60 + 30)).toBe("1:30 PM");
    expect(formatMinutesOfDay(0)).toBe("12 AM");
    expect(formatMinutesOfDay(12 * 60)).toBe("12 PM");
  });
});

describe("expandBlockInWeek", () => {
  it("returns one occurrence per matched weekday in the week", () => {
    const block = makeMeetingBlock({ days: [1, 3, 5], startMinutes: 600, endMinutes: 650 });
    const occurrences = expandBlockInWeek(block, WEEK_START, WEEK_END, null, null);
    expect(occurrences.map((o) => o.dayOfWeek).sort()).toEqual([1, 3, 5]);
    expect(occurrences.every((o) => o.startMinutes === 600 && o.endMinutes === 650)).toBe(true);
  });

  it("excludes days outside [recurrence_start_date, recurrence_end_date]", () => {
    const block = makeMeetingBlock({ days: [1, 3, 5] });
    // Mon 1/5, Wed 1/7, Fri 1/9 -- range starts on Wed, so only Wed/Fri remain.
    const occurrences = expandBlockInWeek(block, WEEK_START, WEEK_END, "2026-01-07", null);
    expect(occurrences.map((o) => o.dayOfWeek).sort()).toEqual([3, 5]);
  });

  it("excludes days after recurrence_end_date", () => {
    const block = makeMeetingBlock({ days: [1, 3, 5] });
    const occurrences = expandBlockInWeek(block, WEEK_START, WEEK_END, null, "2026-01-06");
    expect(occurrences.map((o) => o.dayOfWeek).sort()).toEqual([1]);
  });

  it("returns nothing when the block's days never occur", () => {
    const block = makeMeetingBlock({ days: [] });
    expect(expandBlockInWeek(block, WEEK_START, WEEK_END, null, null)).toHaveLength(0);
  });
});

describe("getNextOccurrence", () => {
  it("returns null when there are no blocks", () => {
    expect(getNextOccurrence([], new Date(2026, 0, 7, 8, 0), null, null)).toBeNull();
  });

  it("finds the next occurrence later today when its start time hasn't passed", () => {
    // Wed 2026-01-07, 8:00 AM local; block starts at 10:00 AM the same day.
    const reference = new Date(2026, 0, 7, 8, 0);
    const block = makeMeetingBlock({ days: [3], startMinutes: 10 * 60, endMinutes: 10 * 60 + 50 });
    const next = getNextOccurrence([block], reference, null, null);
    expect(next).not.toBeNull();
    expect(next!.date.getDay()).toBe(3);
    expect(next!.date.getDate()).toBe(7);
    expect(next!.startMinutes).toBe(10 * 60);
  });

  it("skips today's occurrence once its start time has already passed", () => {
    // Wed 2026-01-07, 11:00 AM local; block starts 10:00 AM Wednesdays only -- next hit is the following Wednesday.
    const reference = new Date(2026, 0, 7, 11, 0);
    const block = makeMeetingBlock({ days: [3], startMinutes: 10 * 60, endMinutes: 10 * 60 + 50 });
    const next = getNextOccurrence([block], reference, null, null);
    expect(next!.date.getDate()).toBe(14);
  });

  it("respects the recurrence date range, skipping past its end", () => {
    const reference = new Date(2026, 0, 1, 8, 0);
    const block = makeMeetingBlock({ days: [1, 2, 3, 4, 5, 6, 0] });
    const next = getNextOccurrence([block], reference, "2026-02-01", "2026-02-05");
    expect(next).not.toBeNull();
    expect(next!.date.getMonth()).toBe(1); // February
    expect(next!.date.getDate()).toBe(1);
  });

  it("returns null when the range is entirely in the past", () => {
    const reference = new Date(2026, 5, 1);
    const block = makeMeetingBlock({ days: [1, 2, 3, 4, 5, 6, 0] });
    const next = getNextOccurrence([block], reference, "2026-01-01", "2026-01-05");
    expect(next).toBeNull();
  });
});

describe("formatBlocksSummary", () => {
  it("reports no recurrence configured for an empty block list", () => {
    expect(formatBlocksSummary([])).toBe("No recurrence configured yet.");
  });

  it("formats a single day", () => {
    const block = makeMeetingBlock({ days: [1], startMinutes: 9 * 60, endMinutes: 9 * 60 + 50 });
    expect(formatBlocksSummary([block])).toBe("Every Monday, from 9 AM to 9:50 AM.");
  });

  it("formats two days joined with 'and'", () => {
    const block = makeMeetingBlock({ days: [2, 4], startMinutes: 12 * 60 + 30, endMinutes: 13 * 60 + 50 });
    expect(formatBlocksSummary([block])).toBe("Every Tuesday and Thursday, from 12:30 PM to 1:50 PM.");
  });

  it("formats three or more days as a comma list ending in 'and'", () => {
    const block = makeMeetingBlock({ days: [1, 3, 5], startMinutes: 10 * 60, endMinutes: 10 * 60 + 50 });
    expect(formatBlocksSummary([block])).toBe("Every Monday, Wednesday and Friday, from 10 AM to 10:50 AM.");
  });

  it("joins multiple blocks as separate sentences", () => {
    const lecture = makeMeetingBlock({ days: [1, 3], startMinutes: 9 * 60, endMinutes: 9 * 60 + 50 });
    const lab = makeMeetingBlock({ days: [5], startMinutes: 13 * 60, endMinutes: 14 * 60 + 50 });
    expect(formatBlocksSummary([lecture, lab])).toBe(
      "Every Monday and Wednesday, from 9 AM to 9:50 AM. Every Friday, from 1 PM to 2:50 PM.",
    );
  });
});
