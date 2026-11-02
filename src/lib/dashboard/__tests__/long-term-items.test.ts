import { describe, expect, it } from "vitest";
import { buildLongTermItems, formatTouchedLabel } from "../long-term-items";
import { makeTask } from "./fixtures";

const NOW = new Date(2026, 10, 2, 12, 0, 0);

function daysAgo(days: number): string {
  return new Date(2026, 10, 2 - days, 9, 0, 0).toISOString();
}

describe("buildLongTermItems", () => {
  it("includes only open long-term tasks", () => {
    const items = buildLongTermItems(
      [
        makeTask({ id: "lt", is_long_term: true, due_at: null, updated_at: daysAgo(3) }),
        makeTask({ id: "regular", is_long_term: false }),
        makeTask({ id: "done", is_long_term: true, due_at: null, status: "Done" }),
        makeTask({ id: "cancelled", is_long_term: true, due_at: null, status: "Cancelled" }),
      ],
      new Map(),
      NOW,
    );
    expect(items.map((item) => item.id)).toEqual(["lt"]);
  });

  it("sorts longest-untouched first and reports whole days since touched", () => {
    const items = buildLongTermItems(
      [
        makeTask({ id: "recent", is_long_term: true, due_at: null, updated_at: daysAgo(3) }),
        makeTask({ id: "oldest", is_long_term: true, due_at: null, updated_at: daysAgo(44) }),
        makeTask({ id: "today", is_long_term: true, due_at: null, updated_at: daysAgo(0) }),
      ],
      new Map(),
      NOW,
    );
    expect(items.map((item) => [item.id, item.daysSinceTouched])).toEqual([
      ["oldest", 44],
      ["recent", 3],
      ["today", 0],
    ]);
  });

  it("treats a manual 'still on it' acknowledgment as a touch", () => {
    const [item] = buildLongTermItems(
      [makeTask({ id: "lt", is_long_term: true, due_at: null, updated_at: daysAgo(44), acknowledged_at: daysAgo(2) })],
      new Map(),
      NOW,
    );
    expect(item.daysSinceTouched).toBe(2);
  });

  it("treats checklist/attachment/note activity as a touch", () => {
    const activity = new Map([["lt", new Date(daysAgo(1))]]);
    const [item] = buildLongTermItems([makeTask({ id: "lt", is_long_term: true, due_at: null, updated_at: daysAgo(30) })], activity, NOW);
    expect(item.daysSinceTouched).toBe(1);
  });

  it("links each item to its board card", () => {
    const [item] = buildLongTermItems([makeTask({ id: "abc", is_long_term: true, due_at: null })], new Map(), NOW);
    expect(item.href).toBe("/board/abc");
  });

  it("returns an empty list when nothing is long-term", () => {
    expect(buildLongTermItems([makeTask()], new Map(), NOW)).toEqual([]);
  });
});

describe("formatTouchedLabel", () => {
  it("never uses due/overdue phrasing", () => {
    expect(formatTouchedLabel(0)).toBe("touched today");
    expect(formatTouchedLabel(1)).toBe("touched 1d ago");
    expect(formatTouchedLabel(44)).toBe("touched 44d ago");
  });
});
