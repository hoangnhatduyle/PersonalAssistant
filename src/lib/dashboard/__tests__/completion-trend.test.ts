import { describe, expect, it } from "vitest";
import { buildCompletionTrend, buildCompletedThisWeek } from "../completion-trend";
import { makeDeadline, makeTask, makeTodoItem } from "./fixtures";

function daysAgoISO(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

describe("buildCompletionTrend", () => {
  it("buckets completed deadlines, done tasks, and done to-do items by day, oldest first", () => {
    const trend = buildCompletionTrend(
      [makeDeadline({ status: "Completed", updated_at: daysAgoISO(0) })],
      [makeTask({ status: "Done", updated_at: daysAgoISO(0) })],
      [makeTodoItem({ is_done: true, updated_at: daysAgoISO(0) })],
      7,
    );
    expect(trend).toHaveLength(7);
    expect(trend[6]).toBe(3);
  });

  it("places yesterday's completion one bucket before today's", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", updated_at: daysAgoISO(1) })], [], [], 7);
    expect(trend[5]).toBe(1);
    expect(trend[6]).toBe(0);
  });

  it("ignores items outside the trailing window", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", updated_at: daysAgoISO(30) })], [], [], 7);
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("ignores non-terminal statuses", () => {
    const trend = buildCompletionTrend(
      [makeDeadline({ status: "In Progress", updated_at: daysAgoISO(0) })],
      [makeTask({ status: "Open", updated_at: daysAgoISO(0) })],
      [makeTodoItem({ is_done: false, updated_at: daysAgoISO(0) })],
      7,
    );
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});

describe("buildCompletedThisWeek", () => {
  it("returns the actual completed rows within the window, most-recent-first", () => {
    const items = buildCompletedThisWeek(
      [makeDeadline({ id: "d-old", title: "Older deadline", status: "Completed", updated_at: daysAgoISO(2) })],
      [makeTask({ id: "t-new", title: "Newer task", status: "Done", updated_at: daysAgoISO(0) })],
      [makeTodoItem({ id: "todo-1", title: "Course reading", is_done: true, updated_at: daysAgoISO(1) })],
      7,
    );
    expect(items.map((item) => item.id)).toEqual(["t-new", "todo-1", "d-old"]);
    expect(items[0]).toMatchObject({ kind: "task", title: "Newer task", href: "/tasks/t-new" });
    expect(items[1]).toMatchObject({ kind: "todo", title: "Course reading", href: "/courses/todos" });
    expect(items[2]).toMatchObject({ kind: "deadline", title: "Older deadline", href: "/deadlines/d-old" });
  });

  it("excludes non-terminal statuses and items outside the trailing window", () => {
    const items = buildCompletedThisWeek(
      [
        makeDeadline({ id: "d-in-progress", status: "In Progress", updated_at: daysAgoISO(0) }),
        makeDeadline({ id: "d-too-old", status: "Completed", updated_at: daysAgoISO(30) }),
      ],
      [makeTask({ id: "t-open", status: "Open", updated_at: daysAgoISO(0) })],
      [makeTodoItem({ id: "todo-open", is_done: false, updated_at: daysAgoISO(0) })],
      7,
    );
    expect(items).toHaveLength(0);
  });
});
