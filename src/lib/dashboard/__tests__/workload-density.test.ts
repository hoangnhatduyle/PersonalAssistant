import { describe, expect, it } from "vitest";
import { buildWorkloadDensity, itemsForDensityDay, countPastDueItems, pastDueItemsFor } from "../workload-density";
import { makeAppointment, makeCourse, makeDeadline, makeTask, makeTodoList } from "./fixtures";

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
    const buckets = buildWorkloadDensity([makeDeadline({ status: "Not Started", due_at: daysFromNowISO(2) })], [], [], 7);
    expect(buckets).toHaveLength(7);
    expect(buckets[2].deadlineCount).toBe(1);
    expect(buckets[2].total).toBe(1);
  });

  it("buckets an open task with a due date into the correct day offset", () => {
    const buckets = buildWorkloadDensity([], [makeTask({ status: "Open", due_at: daysFromNowISO(1) })], [], 7);
    expect(buckets[1].taskCount).toBe(1);
  });

  it("buckets a task filed under a Board List by its due_at, same as any other task", () => {
    const buckets = buildWorkloadDensity([], [makeTask({ status: "Open", due_at: daysFromNowISO(3), list_id: "list-1" })], [], 7);
    expect(buckets[3].taskCount).toBe(1);
    expect(buckets[3].total).toBe(1);
  });

  it("excludes closed/done items regardless of due date", () => {
    const buckets = buildWorkloadDensity(
      [makeDeadline({ status: "Completed", due_at: daysFromNowISO(1) })],
      [makeTask({ status: "Done", due_at: daysFromNowISO(1) })],
      [],
      7,
    );
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(0);
  });

  it("excludes items outside the window", () => {
    const buckets = buildWorkloadDensity([makeDeadline({ status: "Not Started", due_at: daysFromNowISO(10) })], [], [], 7);
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(0);
  });

  it("returns all-zero buckets for empty input", () => {
    const buckets = buildWorkloadDensity([], [], [], 7);
    expect(buckets.every((bucket) => bucket.total === 0 && bucket.sessionCount === 0)).toBe(true);
  });

  it("buckets a planned Session by date without adding to total", () => {
    const buckets = buildWorkloadDensity(
      [],
      [],
      [makeAppointment({ date: dateKeyFromNowOffset(2), category: "Session", session_status: "planned" })],
      7,
    );
    expect(buckets[2].sessionCount).toBe(1);
    expect(buckets[2].total).toBe(0);
  });

  it("ignores a done/skipped Session and a non-Session appointment", () => {
    const buckets = buildWorkloadDensity(
      [],
      [],
      [
        makeAppointment({ date: dateKeyFromNowOffset(1), category: "Session", session_status: "done" }),
        makeAppointment({ date: dateKeyFromNowOffset(1), category: "Event", event_status: "planned" }),
      ],
      7,
    );
    expect(buckets[1].sessionCount).toBe(0);
  });
});

describe("itemsForDensityDay", () => {
  it("returns only items matching the given date", () => {
    const date = dateKeyFromNowOffset(2);
    const items = itemsForDensityDay(
      [makeDeadline({ id: "d-match", status: "Not Started", due_at: daysFromNowISO(2) })],
      [makeTask({ id: "t-other", status: "Open", due_at: daysFromNowISO(5) })],
      date,
    );
    expect(items.map((item) => item.id)).toEqual(["d-match"]);
  });

  it("enriches a listed task with its Board List's name and course name via the list's course_id", () => {
    const date = dateKeyFromNowOffset(1);
    const items = itemsForDensityDay(
      [],
      [makeTask({ id: "t-1", list_id: "list-1", status: "Open", due_at: `${date}T12:00:00` })],
      date,
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
      [makeCourse({ id: "c-1", name: "Intro to CS" })],
    );
    expect(items[0]).toMatchObject({ listName: "To-Do List", courseName: "Intro to CS" });
  });

  it("resolves a listed task's listName even when its list has no course, and leaves courseName undefined", () => {
    const date = dateKeyFromNowOffset(1);
    const items = itemsForDensityDay(
      [],
      [makeTask({ id: "t-1", list_id: "list-1", status: "Open", due_at: `${date}T12:00:00` })],
      date,
      [makeTodoList({ id: "list-1", course_id: null, name: "Personal Errands" })],
      [],
    );
    expect(items[0].listName).toBe("Personal Errands");
    expect(items[0].courseName).toBeUndefined();
  });

  it("enriches a task with its tags", () => {
    const items = itemsForDensityDay([], [makeTask({ id: "t-1", status: "Open", due_at: daysFromNowISO(2), tags: ["urgent", "reading"] })], dateKeyFromNowOffset(2));
    expect(items[0]).toMatchObject({ tags: ["urgent", "reading"] });
  });

  it("includes a planned Session for the matching date, linked to its deadline", () => {
    const date = dateKeyFromNowOffset(1);
    const items = itemsForDensityDay([], [], date, [], [], [makeAppointment({ id: "sess-1", date, category: "Session", session_status: "planned", deadline_id: "d-9" })]);
    expect(items).toEqual([{ id: "sess-1", kind: "session", title: "Session", href: "/courses/deadlines/d-9" }]);
  });
});

describe("countPastDueItems", () => {
  it("counts an open deadline whose due date is before today", () => {
    const summary = countPastDueItems([makeDeadline({ status: "Not Started", due_at: daysFromNowISO(-2) })], []);
    expect(summary.count).toBe(1);
    expect(summary.deadlineCount).toBe(1);
  });

  it("counts an open task whose due_at is before today", () => {
    const summary = countPastDueItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(-1) })]);
    expect(summary.count).toBe(1);
    expect(summary.taskCount).toBe(1);
  });

  it("excludes closed/done past-due items", () => {
    const summary = countPastDueItems(
      [makeDeadline({ status: "Completed", due_at: daysFromNowISO(-2) })],
      [makeTask({ status: "Done", due_at: daysFromNowISO(-1) })],
    );
    expect(summary.count).toBe(0);
  });

  it("excludes items due today or later", () => {
    const summary = countPastDueItems(
      [makeDeadline({ status: "Not Started", due_at: daysFromNowISO(0) })],
      [makeTask({ status: "Open", due_at: daysFromNowISO(1) })],
    );
    expect(summary.count).toBe(0);
  });

  it("sums counts across both kinds", () => {
    const summary = countPastDueItems(
      [makeDeadline({ status: "Not Started", due_at: daysFromNowISO(-1) })],
      [makeTask({ status: "Open", due_at: daysFromNowISO(-1) })],
    );
    expect(summary.count).toBe(2);
  });
});

describe("pastDueItemsFor", () => {
  it("returns only items with a due date before today", () => {
    const items = pastDueItemsFor(
      [makeDeadline({ id: "d-past", status: "Not Started", due_at: daysFromNowISO(-2) })],
      [makeTask({ id: "t-future", status: "Open", due_at: daysFromNowISO(2) })],
    );
    expect(items.map((item) => item.id)).toEqual(["d-past"]);
  });

  it("resolves listName and courseName for a past-due listed task", () => {
    const items = pastDueItemsFor(
      [],
      [makeTask({ id: "t-1", list_id: "list-1", status: "Open", due_at: daysFromNowISO(-1) })],
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
      [makeCourse({ id: "c-1", name: "Intro to CS" })],
    );
    expect(items[0]).toMatchObject({ listName: "To-Do List", courseName: "Intro to CS" });
  });

  it("excludes closed/done items", () => {
    const items = pastDueItemsFor(
      [makeDeadline({ status: "Completed", due_at: daysFromNowISO(-2) })],
      [makeTask({ status: "Done", due_at: daysFromNowISO(-1) })],
    );
    expect(items).toHaveLength(0);
  });
});
