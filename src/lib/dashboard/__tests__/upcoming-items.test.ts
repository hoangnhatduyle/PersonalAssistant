import { describe, expect, it } from "vitest";
import { buildUpcomingItems, filterUpcomingItemsByTimeWindow, isOpenDeadline, isOpenTask } from "../upcoming-items";
import type { UpcomingItem } from "../upcoming-items";
import { makeDeadline, makeReminder, makeTask, makeTodoItem } from "./fixtures";

describe("isOpenDeadline / isOpenTask", () => {
  it("excludes terminal deadline statuses", () => {
    expect(isOpenDeadline("Completed")).toBe(false);
    expect(isOpenDeadline("Cancelled")).toBe(false);
    expect(isOpenDeadline("Overdue")).toBe(true);
  });

  it("only Open counts as an open task", () => {
    expect(isOpenTask("Open")).toBe(true);
    expect(isOpenTask("Done")).toBe(false);
    expect(isOpenTask("Cancelled")).toBe(false);
  });
});

describe("buildUpcomingItems", () => {
  it("excludes completed/cancelled deadlines and non-Open or dateless tasks", () => {
    const items = buildUpcomingItems({
      deadlines: [makeDeadline({ id: "d-done", status: "Completed" })],
      tasks: [makeTask({ id: "t-done", status: "Done" }), makeTask({ id: "t-no-date", due_at: null })],
    });
    expect(items).toHaveLength(0);
  });

  it("sorts deadlines and tasks ascending by due_at", () => {
    const items = buildUpcomingItems({
      deadlines: [makeDeadline({ id: "d-1", due_at: "2026-01-10T00:00:00Z" })],
      tasks: [makeTask({ id: "t-1", due_at: "2026-01-02T00:00:00Z" })],
    });
    expect(items.map((item) => item.id)).toEqual(["t-1", "d-1"]);
  });

  it("marks Overdue deadlines and Delivered reminders as urgent", () => {
    const items = buildUpcomingItems({
      deadlines: [makeDeadline({ id: "d-overdue", status: "Overdue", due_at: "2026-01-01T00:00:00Z" })],
      tasks: [],
      reminders: [makeReminder({ id: "r-1", acknowledgment_state: "Delivered" })],
    });
    expect(items.find((item) => item.id === "d-overdue")?.urgent).toBe(true);
    expect(items.find((item) => item.id === "r-1")?.urgent).toBe(true);
  });

  it("resolves a reminder's title from its target's real title", () => {
    const items = buildUpcomingItems({
      deadlines: [makeDeadline({ id: "d-1", title: "Essay draft" })],
      tasks: [],
      reminders: [makeReminder({ id: "r-1", target_type: "deadline", target_id: "d-1" })],
    });
    expect(items.find((item) => item.id === "r-1")?.title).toBe("Essay draft");
  });

  it("falls back to a generic title when the reminder's target can't be resolved", () => {
    const items = buildUpcomingItems({
      deadlines: [],
      tasks: [],
      reminders: [makeReminder({ id: "r-1", target_type: "deadline", target_id: "missing" })],
    });
    expect(items[0].title).toBe("Reminder");
  });

  it("does not mark a todo item urgent on its due date — due_date is a calendar day, not midnight UTC", () => {
    const today = new Date().toISOString().slice(0, 10);
    const items = buildUpcomingItems({
      deadlines: [],
      tasks: [],
      todoItems: [makeTodoItem({ id: "todo-today", due_date: today })],
    });
    expect(items.find((item) => item.id === "todo-today")?.urgent).toBe(false);
  });

  it("marks a task or todo item urgent once its due date is in the past, even without a status field to carry it", () => {
    const items = buildUpcomingItems({
      deadlines: [],
      tasks: [makeTask({ id: "t-past", due_at: "2020-01-01T00:00:00Z" }), makeTask({ id: "t-future", due_at: "2999-01-01T00:00:00Z" })],
      todoItems: [makeTodoItem({ id: "todo-past", due_date: "2020-01-01" }), makeTodoItem({ id: "todo-future", due_date: "2999-01-01" })],
    });
    expect(items.find((item) => item.id === "t-past")?.urgent).toBe(true);
    expect(items.find((item) => item.id === "t-future")?.urgent).toBe(false);
    expect(items.find((item) => item.id === "todo-past")?.urgent).toBe(true);
    expect(items.find((item) => item.id === "todo-future")?.urgent).toBe(false);
  });

  it("includes only live, not-done todo items with a due date, linking to the course to-do board", () => {
    const items = buildUpcomingItems({
      deadlines: [],
      tasks: [],
      todoItems: [
        makeTodoItem({ id: "todo-open", is_done: false, due_date: "2026-01-04" }),
        makeTodoItem({ id: "todo-done", is_done: true, due_date: "2026-01-04" }),
        makeTodoItem({ id: "todo-no-date", is_done: false, due_date: null }),
      ],
    });
    expect(items.map((item) => item.id)).toEqual(["todo-open"]);
    expect(items[0]).toMatchObject({ kind: "todo", href: "/courses/todos" });
  });

  it("uses snooze_until instead of trigger_at for a Snoozed reminder", () => {
    const items = buildUpcomingItems({
      deadlines: [],
      tasks: [],
      reminders: [
        makeReminder({
          id: "r-1",
          acknowledgment_state: "Snoozed",
          trigger_at: "2026-01-01T00:00:00Z",
          snooze_until: "2026-01-09T00:00:00Z",
        }),
      ],
    });
    expect(items[0].at.toISOString()).toBe("2026-01-09T00:00:00.000Z");
  });
});

function itemAt(id: string, at: string): UpcomingItem {
  return { id, kind: "task", title: id, at: new Date(at), href: null, urgent: false };
}

describe("filterUpcomingItemsByTimeWindow", () => {
  const now = new Date("2026-09-01T12:00:00");

  it("returns every item for the All window", () => {
    const items = [itemAt("past", "2026-08-30T12:00:00"), itemAt("future", "2026-09-10T12:00:00")];
    expect(filterUpcomingItemsByTimeWindow(items, "all", now).map((item) => item.id)).toEqual(["past", "future"]);
  });

  it("includes overdue and today items in Today", () => {
    const items = [
      itemAt("overdue", "2026-08-31T12:00:00"),
      itemAt("today", "2026-09-01T08:00:00"),
      itemAt("tomorrow", "2026-09-02T08:00:00"),
    ];
    expect(filterUpcomingItemsByTimeWindow(items, "today", now).map((item) => item.id)).toEqual(["overdue", "today"]);
  });

  it("only includes tomorrow in Tomorrow", () => {
    const items = [itemAt("today", "2026-09-01T08:00:00"), itemAt("tomorrow", "2026-09-02T08:00:00")];
    expect(filterUpcomingItemsByTimeWindow(items, "tomorrow", now).map((item) => item.id)).toEqual(["tomorrow"]);
  });

  it("includes the next three calendar days in 3 Days", () => {
    const items = [
      itemAt("overdue", "2026-08-31T12:00:00"),
      itemAt("today", "2026-09-01T08:00:00"),
      itemAt("day-2", "2026-09-03T08:00:00"),
      itemAt("day-3", "2026-09-04T08:00:00"),
    ];
    expect(filterUpcomingItemsByTimeWindow(items, "3days", now).map((item) => item.id)).toEqual(["overdue", "today", "day-2"]);
  });

  it("includes the next seven calendar days in 7 Days", () => {
    const items = [itemAt("today", "2026-09-01T08:00:00"), itemAt("day-7", "2026-09-08T08:00:00"), itemAt("day-8", "2026-09-09T08:00:00")];
    expect(filterUpcomingItemsByTimeWindow(items, "7days", now).map((item) => item.id)).toEqual(["today", "day-7"]);
  });
});
