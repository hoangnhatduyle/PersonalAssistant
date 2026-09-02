import { describe, expect, it } from "vitest";
import { buildStaleItems } from "../stale-items";
import { makeDeadline, makeTask, makeTodoItem } from "./fixtures";

function daysAgoISO(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

describe("buildStaleItems", () => {
  it("includes an open item past the threshold", () => {
    const items = buildStaleItems([makeDeadline({ status: "Not Started", updated_at: daysAgoISO(10) })], [], [], 7);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "deadline", daysSinceUpdate: 10 });
  });

  it("excludes an open item within the threshold", () => {
    const items = buildStaleItems([makeDeadline({ status: "Not Started", updated_at: daysAgoISO(2) })], [], [], 7);
    expect(items).toHaveLength(0);
  });

  it("excludes completed, done, and cancelled items regardless of age", () => {
    const items = buildStaleItems(
      [
        makeDeadline({ id: "d-completed", status: "Completed", updated_at: daysAgoISO(30) }),
        makeDeadline({ id: "d-cancelled", status: "Cancelled", updated_at: daysAgoISO(30) }),
      ],
      [makeTask({ id: "t-done", status: "Done", updated_at: daysAgoISO(30) })],
      [makeTodoItem({ id: "todo-done", is_done: true, updated_at: daysAgoISO(30) })],
      7,
    );
    expect(items).toHaveLength(0);
  });

  it("sorts most-stale-first", () => {
    const items = buildStaleItems(
      [makeDeadline({ id: "d-recent", status: "Not Started", updated_at: daysAgoISO(8) })],
      [makeTask({ id: "t-oldest", status: "Open", updated_at: daysAgoISO(20) })],
      [makeTodoItem({ id: "todo-mid", is_done: false, updated_at: daysAgoISO(12) })],
      7,
    );
    expect(items.map((item) => item.id)).toEqual(["t-oldest", "todo-mid", "d-recent"]);
  });

  it("includes an item exactly at the threshold boundary (inclusive)", () => {
    const items = buildStaleItems([makeDeadline({ status: "Not Started", updated_at: daysAgoISO(7) })], [], [], 7);
    expect(items).toHaveLength(1);
  });
});
