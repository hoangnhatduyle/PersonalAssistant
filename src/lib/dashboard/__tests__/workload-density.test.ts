import { describe, expect, it } from "vitest";
import { buildWorkloadDensity, itemsForDensityDay, countPastDueItems, pastDueItemsFor } from "../workload-density";
import { makeCourse, makeDeadline, makeTask, makeTodoItem, makeTodoList } from "./fixtures";

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

  it("enriches a to-do item with its list name and course name via the list's course_id", () => {
    const date = dateKeyFromNowOffset(1);
    const items = itemsForDensityDay(
      [],
      [],
      [makeTodoItem({ id: "todo-1", list_id: "list-1", is_done: false, due_date: date })],
      date,
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
      [makeCourse({ id: "c-1", name: "Intro to CS" })],
    );
    expect(items[0]).toMatchObject({ listName: "To-Do List", courseName: "Intro to CS" });
  });

  it("resolves a to-do item's listName even when its list has no course, and leaves courseName undefined", () => {
    const date = dateKeyFromNowOffset(1);
    const items = itemsForDensityDay(
      [],
      [],
      [makeTodoItem({ id: "todo-1", list_id: "list-1", is_done: false, due_date: date })],
      date,
      [makeTodoList({ id: "list-1", course_id: null, name: "Personal Errands" })],
      [],
    );
    expect(items[0].listName).toBe("Personal Errands");
    expect(items[0].courseName).toBeUndefined();
  });

  it("enriches a task with its tags", () => {
    const items = itemsForDensityDay(
      [],
      [makeTask({ id: "t-1", status: "Open", due_at: daysFromNowISO(2), tags: ["urgent", "reading"] })],
      [],
      dateKeyFromNowOffset(2),
    );
    expect(items[0]).toMatchObject({ tags: ["urgent", "reading"] });
  });
});

describe("countPastDueItems", () => {
  it("counts an open deadline whose due date is before today", () => {
    const summary = countPastDueItems([makeDeadline({ status: "Not Started", due_at: daysFromNowISO(-2) })], [], []);
    expect(summary.count).toBe(1);
    expect(summary.deadlineCount).toBe(1);
  });

  it("counts an open task whose due_at is before today", () => {
    const summary = countPastDueItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(-1) })], []);
    expect(summary.count).toBe(1);
    expect(summary.taskCount).toBe(1);
  });

  it("counts an open todo whose due_date is before today", () => {
    const summary = countPastDueItems([], [], [makeTodoItem({ is_done: false, due_date: dateKeyFromNowOffset(-3) })]);
    expect(summary.count).toBe(1);
    expect(summary.todoCount).toBe(1);
  });

  it("excludes closed/done past-due items", () => {
    const summary = countPastDueItems(
      [makeDeadline({ status: "Completed", due_at: daysFromNowISO(-2) })],
      [makeTask({ status: "Done", due_at: daysFromNowISO(-1) })],
      [makeTodoItem({ is_done: true, due_date: dateKeyFromNowOffset(-3) })],
    );
    expect(summary.count).toBe(0);
  });

  it("excludes items due today or later", () => {
    const summary = countPastDueItems(
      [makeDeadline({ status: "Not Started", due_at: daysFromNowISO(0) })],
      [makeTask({ status: "Open", due_at: daysFromNowISO(1) })],
      [makeTodoItem({ is_done: false, due_date: dateKeyFromNowOffset(0) })],
    );
    expect(summary.count).toBe(0);
  });

  it("sums counts across all three kinds", () => {
    const summary = countPastDueItems(
      [makeDeadline({ status: "Not Started", due_at: daysFromNowISO(-1) })],
      [makeTask({ status: "Open", due_at: daysFromNowISO(-1) })],
      [makeTodoItem({ is_done: false, due_date: dateKeyFromNowOffset(-1) })],
    );
    expect(summary.count).toBe(3);
  });
});

describe("pastDueItemsFor", () => {
  it("returns only items with a due date before today", () => {
    const items = pastDueItemsFor(
      [makeDeadline({ id: "d-past", status: "Not Started", due_at: daysFromNowISO(-2) })],
      [makeTask({ id: "t-future", status: "Open", due_at: daysFromNowISO(2) })],
      [makeTodoItem({ id: "todo-past", is_done: false, due_date: dateKeyFromNowOffset(-1) })],
    );
    expect(items.map((item) => item.id).sort()).toEqual(["d-past", "todo-past"]);
  });

  it("resolves listName and courseName for a past-due to-do item", () => {
    const items = pastDueItemsFor(
      [],
      [],
      [makeTodoItem({ id: "todo-1", list_id: "list-1", is_done: false, due_date: dateKeyFromNowOffset(-1) })],
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
      [makeCourse({ id: "c-1", name: "Intro to CS" })],
    );
    expect(items[0]).toMatchObject({ listName: "To-Do List", courseName: "Intro to CS" });
  });

  it("excludes closed/done items", () => {
    const items = pastDueItemsFor(
      [makeDeadline({ status: "Completed", due_at: daysFromNowISO(-2) })],
      [makeTask({ status: "Done", due_at: daysFromNowISO(-1) })],
      [makeTodoItem({ is_done: true, due_date: dateKeyFromNowOffset(-3) })],
    );
    expect(items).toHaveLength(0);
  });
});
