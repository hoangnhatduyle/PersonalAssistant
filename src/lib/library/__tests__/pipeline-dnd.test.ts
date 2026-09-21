import { describe, expect, it } from "vitest";
import { pickAdjacentColumn, statusFromDroppableId } from "@/lib/library/pipeline-dnd";

const columns = [
  { id: "interested", left: 0, top: 0, width: 200 },
  { id: "applied", left: 220, top: 0, width: 200 },
  { id: "interviewing", left: 440, top: 0, width: 200 },
];

describe("pickAdjacentColumn", () => {
  it("moves to the neighbouring column in the pressed direction", () => {
    expect(pickAdjacentColumn(columns, 320, 1)?.id).toBe("interviewing");
    expect(pickAdjacentColumn(columns, 320, -1)?.id).toBe("interested");
  });

  it("returns undefined at either edge", () => {
    expect(pickAdjacentColumn(columns, 100, -1)).toBeUndefined();
    expect(pickAdjacentColumn(columns, 540, 1)).toBeUndefined();
  });

  it("is order-independent (sorts by position first)", () => {
    expect(pickAdjacentColumn([...columns].reverse(), 100, 1)?.id).toBe("applied");
  });

  it("uses the nearest column when the point is in a gutter or outside every column", () => {
    // x=210 sits in the gutter; the nearest centre is 'applied' (320) at 110 vs 'interested' (100) at 110 — the first wins ties.
    expect(pickAdjacentColumn(columns, 250, 1)?.id).toBe("interviewing"); // gutter, nearest = applied
    expect(pickAdjacentColumn(columns, -500, 1)?.id).toBe("applied"); // far left, nearest = interested
  });

  it("returns undefined with no columns", () => {
    expect(pickAdjacentColumn([], 0, 1)).toBeUndefined();
  });
});

describe("statusFromDroppableId", () => {
  it("accepts a status id and rejects anything else", () => {
    expect(statusFromDroppableId("offer")).toBe("offer");
    expect(statusFromDroppableId("not-a-status")).toBeNull();
    expect(statusFromDroppableId(42)).toBeNull();
  });
});
