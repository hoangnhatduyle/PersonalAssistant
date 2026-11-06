import { describe, expect, it } from "vitest";
import { PIXELS_PER_MINUTE } from "../layout-day-events";
import {
  columnDateAtX,
  isSameTimes,
  previewMove,
  previewResize,
  snapToMinutes,
  type EventTimes,
} from "../drag-math";

const px = (minutes: number) => minutes * PIXELS_PER_MINUTE;

const TEN_TO_ELEVEN: EventTimes = { date: "2026-11-05", startMinutes: 600, endMinutes: 660 };

describe("snapToMinutes", () => {
  it("rounds to the nearest 15 minutes", () => {
    expect(snapToMinutes(600)).toBe(600);
    expect(snapToMinutes(607)).toBe(600);
    expect(snapToMinutes(608)).toBe(615);
    expect(snapToMinutes(652)).toBe(645);
  });
});

describe("previewMove", () => {
  it("shifts the start by the pointer's vertical travel, snapped, keeping the duration", () => {
    expect(previewMove(TEN_TO_ELEVEN, px(50), "2026-11-05")).toEqual({ date: "2026-11-05", startMinutes: 645, endMinutes: 705 });
    expect(previewMove(TEN_TO_ELEVEN, px(-30), "2026-11-05")).toEqual({ date: "2026-11-05", startMinutes: 570, endMinutes: 630 });
  });

  it("takes the date of the column the pointer is over", () => {
    expect(previewMove(TEN_TO_ELEVEN, 0, "2026-11-07")).toEqual({ date: "2026-11-07", startMinutes: 600, endMinutes: 660 });
  });

  it("never moves before midnight", () => {
    expect(previewMove(TEN_TO_ELEVEN, px(-900), "2026-11-05")).toEqual({ date: "2026-11-05", startMinutes: 0, endMinutes: 60 });
  });

  it("never lets a block run past the end of the day", () => {
    const moved = previewMove(TEN_TO_ELEVEN, px(2000), "2026-11-05");
    expect(moved.endMinutes).toBe(1440);
    expect(moved.startMinutes).toBe(1380);
  });

  it("treats a point marker (deadline/task) as zero-length for clamping, so it can reach late evening", () => {
    const marker: EventTimes = { date: "2026-11-05", startMinutes: 600, endMinutes: 645 };
    expect(previewMove(marker, px(2000), "2026-11-05", { isPoint: true })).toEqual({
      date: "2026-11-05",
      startMinutes: 1425,
      endMinutes: 1470,
    });
  });

  it("changes only the date when the pointer travelled sideways, keeping the exact original time", () => {
    // 11:59 PM (a deadline's default) and an off-grid 10:07 must not be re-snapped or clamped by a pure column change.
    const lateMarker: EventTimes = { date: "2026-11-05", startMinutes: 1439, endMinutes: 1484 };
    expect(previewMove(lateMarker, 0, "2026-11-06", { isPoint: true })).toEqual({ date: "2026-11-06", startMinutes: 1439, endMinutes: 1484 });
    const offGrid: EventTimes = { date: "2026-11-05", startMinutes: 607, endMinutes: 667 };
    expect(previewMove(offGrid, px(3), "2026-11-07")).toEqual({ date: "2026-11-07", startMinutes: 607, endMinutes: 667 });
  });

  it("does not pull an overnight appointment (ending after midnight) earlier just because it moved", () => {
    const overnight: EventTimes = { date: "2026-11-05", startMinutes: 1320, endMinutes: 1560 }; // 10 PM, 4 hours
    expect(previewMove(overnight, 0, "2026-11-06")).toEqual({ date: "2026-11-06", startMinutes: 1320, endMinutes: 1560 });
    // Dragged down further it stays put rather than sliding earlier.
    expect(previewMove(overnight, px(30), "2026-11-05").startMinutes).toBe(1320);
  });

  it("is a no-op for zero travel in the same column", () => {
    expect(isSameTimes(previewMove(TEN_TO_ELEVEN, 0, "2026-11-05"), TEN_TO_ELEVEN)).toBe(true);
  });
});

describe("previewResize", () => {
  it("moves only the end, snapped, leaving start and date alone", () => {
    expect(previewResize(TEN_TO_ELEVEN, px(40))).toEqual({ date: "2026-11-05", startMinutes: 600, endMinutes: 705 });
    expect(previewResize(TEN_TO_ELEVEN, px(-20))).toEqual({ date: "2026-11-05", startMinutes: 600, endMinutes: 645 });
  });

  it("keeps at least 15 minutes", () => {
    expect(previewResize(TEN_TO_ELEVEN, px(-500)).endMinutes).toBe(615);
  });

  it("does not shorten an event that already runs past midnight", () => {
    const overnight: EventTimes = { date: "2026-11-05", startMinutes: 1320, endMinutes: 1560 };
    expect(previewResize(overnight, 0).endMinutes).toBe(1560);
    expect(previewResize(overnight, px(30)).endMinutes).toBe(1560);
  });

  it("stops at the end of the day", () => {
    expect(previewResize(TEN_TO_ELEVEN, px(5000)).endMinutes).toBe(1440);
  });
});

describe("columnDateAtX", () => {
  const columns = [
    { date: "2026-11-01", left: 100, right: 200 },
    { date: "2026-11-02", left: 200, right: 300 },
    { date: "2026-11-03", left: 300, right: 400 },
  ];

  it("returns the column containing x", () => {
    expect(columnDateAtX(150, columns)).toBe("2026-11-01");
    expect(columnDateAtX(250, columns)).toBe("2026-11-02");
    expect(columnDateAtX(399, columns)).toBe("2026-11-03");
  });

  it("clamps to the nearest edge column when x is outside the grid", () => {
    expect(columnDateAtX(10, columns)).toBe("2026-11-01");
    expect(columnDateAtX(900, columns)).toBe("2026-11-03");
  });

  it("returns null when there are no columns", () => {
    expect(columnDateAtX(150, [])).toBeNull();
  });
});

describe("isSameTimes", () => {
  it("compares date, start and end", () => {
    expect(isSameTimes(TEN_TO_ELEVEN, { ...TEN_TO_ELEVEN })).toBe(true);
    expect(isSameTimes(TEN_TO_ELEVEN, { ...TEN_TO_ELEVEN, endMinutes: 675 })).toBe(false);
    expect(isSameTimes(TEN_TO_ELEVEN, { ...TEN_TO_ELEVEN, date: "2026-11-06" })).toBe(false);
  });
});
