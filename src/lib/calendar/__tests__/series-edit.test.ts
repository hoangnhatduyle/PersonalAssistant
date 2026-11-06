import { describe, expect, it } from "vitest";
import { applySeriesEdit, MAX_MEETING_BLOCKS } from "../series-edit";
import type { MeetingBlock } from "../recurrence";

const THU = 4;
const WED = 3;

describe("applySeriesEdit (\"All occurrences\")", () => {
  it("edits a single-day block in place", () => {
    const blocks: MeetingBlock[] = [{ days: [THU], startMinutes: 510, endMinutes: 990 }];
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 780, endMinutes: 990 })).toEqual([
      { days: [THU], startMinutes: 780, endMinutes: 990 },
    ]);
  });

  it("changes only the dragged weekday when the block covers several, by splitting it off (First Solar: Thursdays only)", () => {
    const blocks: MeetingBlock[] = [{ days: [1, 2, 4, 5], startMinutes: 510, endMinutes: 990 }];
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 780, endMinutes: 990 })).toEqual([
      { days: [1, 2, 5], startMinutes: 510, endMinutes: 990 },
      { days: [THU], startMinutes: 780, endMinutes: 990 },
    ]);
  });

  it("moves a weekday to another one at the same times by joining the block that already has those times", () => {
    const blocks: MeetingBlock[] = [{ days: [1, 2, 4], startMinutes: 510, endMinutes: 990 }];
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: 5, startMinutes: 510, endMinutes: 990 })).toEqual([
      { days: [1, 2, 5], startMinutes: 510, endMinutes: 990 },
    ]);
  });

  it("moves a weekday to another one at different times as its own window, leaving the block's other days alone", () => {
    const blocks: MeetingBlock[] = [{ days: [1, 2, 4], startMinutes: 510, endMinutes: 990 }];
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: 5, startMinutes: 600, endMinutes: 700 })).toEqual([
      { days: [1, 2], startMinutes: 510, endMinutes: 990 },
      { days: [5], startMinutes: 600, endMinutes: 700 },
    ]);
  });

  it("joins an existing block that already has the new times instead of adding a near-duplicate", () => {
    const blocks: MeetingBlock[] = [
      { days: [1, 2, 4, 5], startMinutes: 510, endMinutes: 990 },
      { days: [WED], startMinutes: 480, endMinutes: 960 },
    ];
    // Thursday becomes Wednesday's 8:00-4:00.
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: WED, startMinutes: 480, endMinutes: 960 })).toEqual([
      { days: [1, 2, 5], startMinutes: 510, endMinutes: 990 },
      { days: [WED], startMinutes: 480, endMinutes: 960 },
    ]);
    // A different weekday does join it.
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: 6, startMinutes: 480, endMinutes: 960 })).toEqual([
      { days: [1, 2, 5], startMinutes: 510, endMinutes: 990 },
      { days: [WED, 6], startMinutes: 480, endMinutes: 960 },
    ]);
  });

  it("keeps each block's days in ascending order", () => {
    const blocks: MeetingBlock[] = [{ days: [5, 1, 4], startMinutes: 510, endMinutes: 990 }];
    const result = applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: 5, toDayOfWeek: 5, startMinutes: 600, endMinutes: 700 });
    expect(result?.[0].days).toEqual([1, 4]);
  });

  it("does not touch the caller's blocks", () => {
    const blocks: MeetingBlock[] = [{ days: [1, 4], startMinutes: 510, endMinutes: 990 }];
    const snapshot = JSON.parse(JSON.stringify(blocks));
    applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 780, endMinutes: 990 });
    expect(blocks).toEqual(snapshot);
  });

  it("leaves the pattern as it was when nothing really changed", () => {
    const blocks: MeetingBlock[] = [{ days: [1, 4], startMinutes: 510, endMinutes: 990 }];
    const result = applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 510, endMinutes: 990 });
    expect(result).toEqual([{ days: [1, 4], startMinutes: 510, endMinutes: 990 }]);
  });

  it("refuses an edit that would need more than the maximum number of time windows", () => {
    const full: MeetingBlock[] = Array.from({ length: MAX_MEETING_BLOCKS }, (_, index) => ({ days: [1, 4], startMinutes: 60 * index, endMinutes: 60 * index + 30 }));
    expect(applySeriesEdit(full, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 700, endMinutes: 760 })).toBeNull();
  });

  it("refuses a times that cross midnight or end before they start, and a source day the block doesn't have", () => {
    const blocks: MeetingBlock[] = [{ days: [4], startMinutes: 510, endMinutes: 990 }];
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 600, endMinutes: 1440 })).toBeNull();
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 700, endMinutes: 700 })).toBeNull();
    expect(applySeriesEdit(blocks, { blockIndex: 0, fromDayOfWeek: WED, toDayOfWeek: WED, startMinutes: 600, endMinutes: 700 })).toBeNull();
    expect(applySeriesEdit(blocks, { blockIndex: 3, fromDayOfWeek: THU, toDayOfWeek: THU, startMinutes: 600, endMinutes: 700 })).toBeNull();
  });
});
