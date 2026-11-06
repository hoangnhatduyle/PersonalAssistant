import { describe, expect, it } from "vitest";
import {
  findSeriesOccurrence,
  getNextResolvedOccurrence,
  resolveOccurrencesInWeek,
  resolveOccurrencesOnDates,
  type OccurrenceOverride,
  type RecurrenceSource,
} from "../occurrence-overrides";
import { expandBlockInWeek, getNextOccurrence, toDateOnly, type MeetingBlock } from "../recurrence";

// 2026-11-01 is a Sunday: the week of Sun Nov 1 .. Sat Nov 7 (Thu = Nov 5).
const weekStart = (iso: string) => new Date(`${iso}T00:00:00`);
const weekEnd = (start: Date) => {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
};

const THURSDAY_CLASS: MeetingBlock = { days: [4], startMinutes: 510, endMinutes: 990 }; // 8:30 AM - 4:30 PM
const ALL_WEEKDAYS: MeetingBlock = { days: [1, 2, 3, 4, 5], startMinutes: 540, endMinutes: 600 };

function source(overrides: Partial<RecurrenceSource> = {}): RecurrenceSource {
  return { meeting_blocks: [THURSDAY_CLASS], recurrence_start_date: null, recurrence_end_date: null, occurrence_overrides: [], ...overrides };
}

const moved = (originalDate: string, originalStart: number, newDate: string, newStart: number, newEnd: number): OccurrenceOverride => ({
  original_date: originalDate,
  original_start_minutes: originalStart,
  is_cancelled: false,
  new_date: newDate,
  new_start_minutes: newStart,
  new_end_minutes: newEnd,
});

const cancelled = (originalDate: string, originalStart: number): OccurrenceOverride => ({
  original_date: originalDate,
  original_start_minutes: originalStart,
  is_cancelled: true,
  new_date: null,
  new_start_minutes: null,
  new_end_minutes: null,
});

const summarize = (occurrences: ReturnType<typeof resolveOccurrencesInWeek>) =>
  occurrences.map(({ blockIndex, date, startMinutes, endMinutes, isOverridden }) => ({ blockIndex, date, startMinutes, endMinutes, isOverridden }));

describe("with no overrides it matches the existing recurrence functions exactly", () => {
  const cases: Array<{ name: string; blocks: MeetingBlock[]; rangeStart: string | null; rangeEnd: string | null }> = [
    { name: "one weekly block", blocks: [THURSDAY_CLASS], rangeStart: null, rangeEnd: null },
    { name: "a block on several days", blocks: [ALL_WEEKDAYS], rangeStart: null, rangeEnd: null },
    { name: "two blocks, one sharing a weekday", blocks: [ALL_WEEKDAYS, { days: [4, 6], startMinutes: 780, endMinutes: 870 }], rangeStart: null, rangeEnd: null },
    { name: "a recurrence range starting mid-week", blocks: [ALL_WEEKDAYS], rangeStart: "2026-11-04", rangeEnd: null },
    { name: "a recurrence range ending mid-week", blocks: [ALL_WEEKDAYS], rangeStart: null, rangeEnd: "2026-11-05" },
    { name: "a range that excludes the week entirely", blocks: [ALL_WEEKDAYS], rangeStart: "2027-01-01", rangeEnd: null },
    { name: "no blocks", blocks: [], rangeStart: null, rangeEnd: null },
  ];

  it.each(cases)("week placement: $name", ({ blocks, rangeStart, rangeEnd }) => {
    for (const week of ["2026-10-25", "2026-11-01", "2026-11-08", "2026-12-27", "2027-03-07"]) {
      const start = weekStart(week);
      const end = weekEnd(start);
      const expected = blocks.flatMap((block, blockIndex) =>
        expandBlockInWeek(block, start, end, rangeStart, rangeEnd).map((occurrence) => ({
          blockIndex,
          date: toDateOnly(occurrence.date),
          startMinutes: occurrence.startMinutes,
          endMinutes: occurrence.endMinutes,
          isOverridden: false,
        })),
      );
      const actual = summarize(
        resolveOccurrencesInWeek({ meeting_blocks: blocks, recurrence_start_date: rangeStart, recurrence_end_date: rangeEnd, occurrence_overrides: [] }, start, end),
      );
      expect(actual, `${week}`).toEqual(expected);
    }
  });

  it.each(cases)("next occurrence: $name", ({ blocks, rangeStart, rangeEnd }) => {
    for (const now of ["2026-11-02T07:00:00", "2026-11-05T09:00:00", "2026-11-05T17:00:00", "2026-12-31T23:30:00"]) {
      const reference = new Date(now);
      const expected = getNextOccurrence(blocks, reference, rangeStart, rangeEnd);
      const actual = getNextResolvedOccurrence({ meeting_blocks: blocks, recurrence_start_date: rangeStart, recurrence_end_date: rangeEnd, occurrence_overrides: [] }, reference);
      if (!expected) {
        expect(actual, now).toBeNull();
      } else {
        expect(actual && { date: actual.date, startMinutes: actual.startMinutes, endMinutes: actual.endMinutes }, now).toEqual({
          date: toDateOnly(expected.date),
          startMinutes: expected.startMinutes,
          endMinutes: expected.endMinutes,
        });
      }
    }
  });

  it("treats an absent or null overrides list as none", () => {
    const start = weekStart("2026-11-01");
    const plain = resolveOccurrencesInWeek(source({ occurrence_overrides: undefined }), start, weekEnd(start));
    expect(plain).toHaveLength(1);
    expect(resolveOccurrencesInWeek(source({ occurrence_overrides: null }), start, weekEnd(start))).toEqual(plain);
  });
});

describe("a cancelled occurrence", () => {
  it("disappears from its day and nowhere else", () => {
    const withCancel = source({ occurrence_overrides: [cancelled("2026-11-05", 510)] });
    expect(resolveOccurrencesInWeek(withCancel, weekStart("2026-11-01"), weekEnd(weekStart("2026-11-01")))).toEqual([]);
    // The next Thursday is untouched.
    expect(summarize(resolveOccurrencesInWeek(withCancel, weekStart("2026-11-08"), weekEnd(weekStart("2026-11-08"))))).toEqual([
      { blockIndex: 0, date: "2026-11-12", startMinutes: 510, endMinutes: 990, isOverridden: false },
    ]);
  });
});

describe("a moved or resized occurrence", () => {
  it("shows the new time on its own day (the real case: a half day off, work starting at 1 PM)", () => {
    const resized = source({ occurrence_overrides: [moved("2026-11-05", 510, "2026-11-05", 780, 990)] });
    const start = weekStart("2026-11-01");
    expect(summarize(resolveOccurrencesInWeek(resized, start, weekEnd(start)))).toEqual([
      { blockIndex: 0, date: "2026-11-05", startMinutes: 780, endMinutes: 990, isOverridden: true },
    ]);
    // Next Thursday: still the full day.
    const next = weekStart("2026-11-08");
    expect(summarize(resolveOccurrencesInWeek(resized, next, weekEnd(next)))).toEqual([
      { blockIndex: 0, date: "2026-11-12", startMinutes: 510, endMinutes: 990, isOverridden: false },
    ]);
  });

  it("remembers which series occurrence it came from, so it can be reverted or keep its done/missed status", () => {
    const resized = source({ occurrence_overrides: [moved("2026-11-05", 510, "2026-11-06", 600, 660)] });
    const start = weekStart("2026-11-01");
    const [occurrence] = resolveOccurrencesInWeek(resized, start, weekEnd(start));
    expect(occurrence).toMatchObject({ originalDate: "2026-11-05", originalStartMinutes: 510, date: "2026-11-06", isOverridden: true });
  });

  it("moves to another day of the same week", () => {
    const start = weekStart("2026-11-01");
    const result = resolveOccurrencesInWeek(source({ occurrence_overrides: [moved("2026-11-05", 510, "2026-11-03", 600, 660)] }), start, weekEnd(start));
    expect(result.map((o) => o.date)).toEqual(["2026-11-03"]);
  });

  it("appears in a week it was moved into from a different week, and leaves the week it came from", () => {
    // Next Thursday's class (Nov 12) is moved back to this Thursday (Nov 5) at 10 AM.
    const s = source({ occurrence_overrides: [moved("2026-11-12", 510, "2026-11-05", 600, 660)] });

    const thisWeek = weekStart("2026-11-01");
    expect(resolveOccurrencesInWeek(s, thisWeek, weekEnd(thisWeek)).map((o) => ({ date: o.date, start: o.startMinutes, original: o.originalDate }))).toEqual([
      { date: "2026-11-05", start: 510, original: "2026-11-05" }, // this Thursday's own class
      { date: "2026-11-05", start: 600, original: "2026-11-12" }, // plus the one moved in
    ]);

    const nextWeek = weekStart("2026-11-08");
    expect(resolveOccurrencesInWeek(s, nextWeek, weekEnd(nextWeek))).toEqual([]);
  });

  it("applies only to the occurrence whose start time it names when a day has two blocks", () => {
    const twoBlocks = source({
      meeting_blocks: [{ days: [4], startMinutes: 540, endMinutes: 600 }, { days: [4], startMinutes: 780, endMinutes: 840 }],
      occurrence_overrides: [cancelled("2026-11-05", 780)],
    });
    const start = weekStart("2026-11-01");
    expect(summarize(resolveOccurrencesInWeek(twoBlocks, start, weekEnd(start)))).toEqual([
      { blockIndex: 0, date: "2026-11-05", startMinutes: 540, endMinutes: 600, isOverridden: false },
    ]);
  });
});

describe("an override that no longer matches the series is ignored", () => {
  const start = weekStart("2026-11-01");
  const baseline = summarize(resolveOccurrencesInWeek(source(), start, weekEnd(start)));

  it.each([
    ["a date the pattern doesn't meet on (a Wednesday)", cancelled("2026-11-04", 510)],
    ["a start time the pattern doesn't have", cancelled("2026-11-05", 540)],
    ["a moved occurrence on a date the pattern doesn't meet on", moved("2026-11-04", 510, "2026-11-05", 600, 660)],
  ])("%s", (_name, override) => {
    expect(summarize(resolveOccurrencesInWeek(source({ occurrence_overrides: [override] }), start, weekEnd(start)))).toEqual(baseline);
  });

  it("an override for a date outside the recurrence range", () => {
    const bounded = source({ recurrence_end_date: "2026-10-31", occurrence_overrides: [moved("2026-11-05", 510, "2026-11-05", 600, 660)] });
    expect(resolveOccurrencesInWeek(bounded, start, weekEnd(start))).toEqual([]);
  });
});

describe("resolveOccurrencesOnDates (conflict detection, voice, Up Next)", () => {
  it("includes an occurrence moved onto the date and excludes one moved or cancelled off it", () => {
    const s = source({
      meeting_blocks: [ALL_WEEKDAYS],
      occurrence_overrides: [cancelled("2026-11-03", 540), moved("2026-11-04", 540, "2026-11-07", 600, 660)],
    });
    expect(resolveOccurrencesOnDates(s, ["2026-11-03"])).toEqual([]);
    expect(resolveOccurrencesOnDates(s, ["2026-11-04"])).toEqual([]);
    expect(resolveOccurrencesOnDates(s, ["2026-11-07"]).map((o) => ({ start: o.startMinutes, end: o.endMinutes }))).toEqual([{ start: 600, end: 660 }]);
    expect(resolveOccurrencesOnDates(s, ["2026-11-05"]).map((o) => o.date)).toEqual(["2026-11-05"]);
  });
});

describe("getNextResolvedOccurrence", () => {
  it("skips a cancelled occurrence", () => {
    const s = source({ occurrence_overrides: [cancelled("2026-11-05", 510)] });
    const next = getNextResolvedOccurrence(s, new Date("2026-11-02T07:00:00"));
    expect(next).toMatchObject({ date: "2026-11-12", startMinutes: 510 });
  });

  it("uses a moved occurrence's new date and time", () => {
    const s = source({ occurrence_overrides: [moved("2026-11-05", 510, "2026-11-04", 780, 840)] });
    const next = getNextResolvedOccurrence(s, new Date("2026-11-02T07:00:00"));
    expect(next).toMatchObject({ date: "2026-11-04", startMinutes: 780, endMinutes: 840, originalDate: "2026-11-05", isOverridden: true });
  });

  it("does not offer today's occurrence once its (new) start time has passed", () => {
    const s = source({ occurrence_overrides: [moved("2026-11-05", 510, "2026-11-05", 780, 990)] });
    // 10:00 AM on the day: the original 8:30 start has passed, but the moved 1 PM start has not.
    expect(getNextResolvedOccurrence(s, new Date("2026-11-05T10:00:00"))).toMatchObject({ date: "2026-11-05", startMinutes: 780 });
    expect(getNextResolvedOccurrence(s, new Date("2026-11-05T14:00:00"))).toMatchObject({ date: "2026-11-12" });
  });

  it("returns null when the series has nothing left", () => {
    expect(getNextResolvedOccurrence(source({ recurrence_end_date: "2026-11-01" }), new Date("2026-11-02T07:00:00"))).toBeNull();
  });
});

describe("findSeriesOccurrence", () => {
  it("finds the block that produces an occurrence, by date and start time", () => {
    const s = source({ meeting_blocks: [ALL_WEEKDAYS, THURSDAY_CLASS] });
    expect(findSeriesOccurrence(s, "2026-11-05", 510)).toEqual({ blockIndex: 1, endMinutes: 990 });
    expect(findSeriesOccurrence(s, "2026-11-05", 540)).toEqual({ blockIndex: 0, endMinutes: 600 });
  });

  it("returns null when the series has no such occurrence", () => {
    const s = source();
    expect(findSeriesOccurrence(s, "2026-11-04", 510)).toBeNull(); // wrong weekday
    expect(findSeriesOccurrence(s, "2026-11-05", 511)).toBeNull(); // wrong start
    expect(findSeriesOccurrence(source({ recurrence_start_date: "2026-12-01" }), "2026-11-05", 510)).toBeNull(); // before the range
  });
});
