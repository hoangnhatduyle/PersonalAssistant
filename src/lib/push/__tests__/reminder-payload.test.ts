import { describe, expect, it } from "vitest";
import { buildReminderPushPayload } from "../reminder-payload";

const now = new Date("2026-11-03T12:00:00.000Z");

describe("buildReminderPushPayload", () => {
  it("builds a task notification that deep-links to the board card", () => {
    expect(
      buildReminderPushPayload({ reminderId: "r-1", targetType: "task", targetId: "t-9", title: "Buy oat milk", dueAt: "2026-11-03T15:00:00.000Z", now }),
    ).toEqual({ title: "Buy oat milk", body: "Task · due in 3h", url: "/board/t-9", tag: "reminder-r-1" });
  });

  it("includes the course name on a deadline and links to the deadline page", () => {
    expect(
      buildReminderPushPayload({
        reminderId: "r-2",
        targetType: "deadline",
        targetId: "d-4",
        title: "Homework 5",
        dueAt: "2026-11-03T12:30:00.000Z",
        courseName: "Algorithms",
        now,
      }),
    ).toEqual({ title: "Homework 5", body: "Algorithms · deadline · due in 30m", url: "/courses/deadlines/d-4", tag: "reminder-r-2" });
  });

  it("says so when the item is already overdue", () => {
    const payload = buildReminderPushPayload({ reminderId: "r-3", targetType: "task", targetId: "t-1", title: "Late thing", dueAt: "2026-11-03T10:00:00.000Z", now });
    expect(payload.body).toBe("Task · due 2h ago");
  });

  it("truncates a very long title", () => {
    const payload = buildReminderPushPayload({ reminderId: "r-4", targetType: "task", targetId: "t-1", title: "x".repeat(300), dueAt: "2026-11-03T15:00:00.000Z", now });
    expect(payload.title.length).toBeLessThanOrEqual(90);
    expect(payload.title.endsWith("…")).toBe(true);
  });

  it("gives each reminder its own tag so repeats replace rather than stack", () => {
    const a = buildReminderPushPayload({ reminderId: "r-5", targetType: "task", targetId: "t-1", title: "A", dueAt: "2026-11-03T15:00:00.000Z", now });
    const b = buildReminderPushPayload({ reminderId: "r-6", targetType: "task", targetId: "t-1", title: "A", dueAt: "2026-11-03T15:00:00.000Z", now });
    expect(a.tag).not.toBe(b.tag);
  });
});
