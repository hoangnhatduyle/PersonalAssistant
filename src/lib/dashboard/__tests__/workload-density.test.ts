import { describe, expect, it } from "vitest";
import { buildWorkloadDensity, itemsForDensityDay } from "../workload-density";
import { makeDeadline, makeTask, makeTodoItem } from "./fixtures";

function daysFromNowISO(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString();
}

function dateKeyFromNowOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("buildWorkloadDensity", () => {
  it("buckets an open deadline into the correct day offset", () => {
    const buckets = buildWorkloadDensity(
      [makeDeadline({ status: "Not Started", due_at: daysFromNowISO(2) })],
      [],
      [],
      7,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[2].deadlineCount).toBe(1);
    expect(buckets[2].total).toBe(1);
  });

  it("buckets an open task with a due date into the correct day offset", () => {
    const buckets = buildWorkloadDensity([], [makeTask({ status: "Open", due_at: daysFromNowISO(1) })], [], 7);
    expect(buckets[1].taskCount).toBe(1);
  });

  it("buckets an open to-do item by its due_date calendar day", () => {
    const buckets = buildWorkloadDensity(
      [],
      [],
      [makeTodoItem({ is_done: false, due_date: dateKeyFromNowOffset(3) })],
      7,
    );
    expect(buckets[3].todoCount).toBe(1);
  });

  it("excludes closed/done items regardless of due date", () => {
    const buckets = buildWorkloadDensity(
      [makeDeadline({ status: "Completed", due_at: daysFromNowISO(1) })],
      [makeTask({ status: "Done", due_at: daysFromNowISO(1) })],
      [makeTodoItem({ is_done: true, due_date: dateKeyFromNowOffset(1) })],
      7,
    );
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(0);
  });

  it("excludes items outside the window", () => {
    const buckets = buildWorkloadDensity(
      [makeDeadline({ status: "Not Started", due_at: daysFromNowISO(10) })],
      [],
      [],
      7,
    );
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(0);
  });

  it("returns all-zero buckets for empty input", () => {
    const buckets = buildWorkloadDensity([], [], [], 7);
    expect(buckets.every((bucket) => bucket.total === 0)).toBe(true);
  });
});

describe("itemsForDensityDay", () => {
  it("returns only items matching the given date", () => {
    const date = dateKeyFromNowOffset(2);
    const items = itemsForDensityDay(
      [makeDeadline({ id: "d-match", status: "Not Started", due_at: daysFromNowISO(2) })],
      [makeTask({ id: "t-other", status: "Open", due_at: daysFromNowISO(5) })],
      [makeTodoItem({ id: "todo-match", is_done: false, due_date: date })],
      date,
    );
    expect(items.map((item) => item.id).sort()).toEqual(["d-match", "todo-match"]);
  });
});
