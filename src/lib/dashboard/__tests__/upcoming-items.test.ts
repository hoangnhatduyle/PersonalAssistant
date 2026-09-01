import { describe, expect, it } from "vitest";
import { buildUpcomingItems, isOpenDeadline, isOpenTask } from "../upcoming-items";
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
