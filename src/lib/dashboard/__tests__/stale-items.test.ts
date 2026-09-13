import { describe, expect, it } from "vitest";
import { buildStaleItems } from "../stale-items";
import { makeAppointment, makeDeadline, makeTask } from "./fixtures";

function daysAgoISO(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function daysFromNowISO(offset: number): string {
  return daysAgoISO(-offset);
}

function dateKeyFromNowOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("buildStaleItems", () => {
  it("includes an overdue open item untouched past the tightest tier", () => {
    const items = buildStaleItems([makeDeadline({ status: "Not Started", updated_at: daysAgoISO(10) })], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "deadline", daysSinceUpdate: 10 });
  });

  it("excludes an open item within its due-date-scaled threshold", () => {
    // Due in 10 days -> the 4-14 day tier -> 5-day threshold; 2 days untouched is within it.
    const items = buildStaleItems([makeDeadline({ status: "Not Started", due_at: daysFromNowISO(10), updated_at: daysAgoISO(2) })], []);
    expect(items).toHaveLength(0);
  });

  it("excludes completed, done, and cancelled items regardless of age", () => {
    const items = buildStaleItems(
      [
        makeDeadline({ id: "d-completed", status: "Completed", updated_at: daysAgoISO(30) }),
        makeDeadline({ id: "d-cancelled", status: "Cancelled", updated_at: daysAgoISO(30) }),
      ],
      [makeTask({ id: "t-done", status: "Done", updated_at: daysAgoISO(30) })],
    );
    expect(items).toHaveLength(0);
  });

  it("sorts most-stale-first", () => {
    const items = buildStaleItems(
      [makeDeadline({ id: "d-recent", status: "Not Started", updated_at: daysAgoISO(8) })],
      [makeTask({ id: "t-oldest", status: "Open", updated_at: daysAgoISO(20) })],
    );
    expect(items.map((item) => item.id)).toEqual(["t-oldest", "d-recent"]);
  });

  describe("due-date-scaled tiers", () => {
    it("flags a Task due within 3 days after 1 day untouched, not before", () => {
      const flagged = buildStaleItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(2), updated_at: daysAgoISO(1) })]);
      expect(flagged).toHaveLength(1);

      const notFlagged = buildStaleItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(2), updated_at: daysAgoISO(0) })]);
      expect(notFlagged).toHaveLength(0);
    });

    it("flags a Task due in 4-14 days after 5 days untouched, not at 4", () => {
      const flagged = buildStaleItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(10), updated_at: daysAgoISO(5) })]);
      expect(flagged).toHaveLength(1);

      const notFlagged = buildStaleItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(10), updated_at: daysAgoISO(4) })]);
      expect(notFlagged).toHaveLength(0);
    });

    it("flags a Task due in 15-21 days after 10 days untouched, not at 9", () => {
      const flagged = buildStaleItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(18), updated_at: daysAgoISO(10) })]);
      expect(flagged).toHaveLength(1);

      const notFlagged = buildStaleItems([], [makeTask({ status: "Open", due_at: daysFromNowISO(18), updated_at: daysAgoISO(9) })]);
      expect(notFlagged).toHaveLength(0);
    });

    it("never flags an item due more than 21 days out, no matter how untouched", () => {
      const items = buildStaleItems([makeDeadline({ status: "Not Started", due_at: daysFromNowISO(30), updated_at: daysAgoISO(60) })], []);
      expect(items).toHaveLength(0);
    });

    it("never flags a Task with no due_at, no matter how untouched", () => {
      const items = buildStaleItems([], [makeTask({ status: "Open", due_at: null, updated_at: daysAgoISO(60) })]);
      expect(items).toHaveLength(0);
    });
  });

  describe("Session suppression (Deadlines only)", () => {
    it("suppresses a stale Deadline with a planned Session logged this week", () => {
      const items = buildStaleItems(
        [makeDeadline({ id: "d-1", status: "Not Started", updated_at: daysAgoISO(10) })],
        [],
        [makeAppointment({ deadline_id: "d-1", category: "Session", session_status: "planned", date: dateKeyFromNowOffset(0) })],
      );
      expect(items).toHaveLength(0);
    });

    it("suppresses a stale Deadline with a planned Session scheduled far in the future", () => {
      const items = buildStaleItems(
        [makeDeadline({ id: "d-1", status: "Not Started", updated_at: daysAgoISO(10) })],
        [],
        [makeAppointment({ deadline_id: "d-1", category: "Session", session_status: "planned", date: dateKeyFromNowOffset(60) })],
      );
      expect(items).toHaveLength(0);
    });

    it("does not suppress when the matching Session is already done", () => {
      const items = buildStaleItems(
        [makeDeadline({ id: "d-1", status: "Not Started", updated_at: daysAgoISO(10) })],
        [],
        [makeAppointment({ deadline_id: "d-1", category: "Session", session_status: "done", date: dateKeyFromNowOffset(0) })],
      );
      expect(items).toHaveLength(1);
    });

    it("does not suppress when the matching Session is outside the lookback window", () => {
      const items = buildStaleItems(
        [makeDeadline({ id: "d-1", status: "Not Started", updated_at: daysAgoISO(10) })],
        [],
        [makeAppointment({ deadline_id: "d-1", category: "Session", session_status: "planned", date: dateKeyFromNowOffset(-10) })],
      );
      expect(items).toHaveLength(1);
    });

    it("never suppresses a Task, regardless of appointments data", () => {
      const items = buildStaleItems(
        [],
        [makeTask({ id: "t-1", status: "Open", updated_at: daysAgoISO(10) })],
        [makeAppointment({ deadline_id: "t-1", category: "Session", session_status: "planned", date: dateKeyFromNowOffset(0) })],
      );
      expect(items).toHaveLength(1);
    });
  });

  describe("acknowledged_at ('still on it')", () => {
    it("resets the clock when acknowledged_at is newer than updated_at", () => {
      const items = buildStaleItems(
        [makeDeadline({ status: "Not Started", updated_at: daysAgoISO(30), acknowledged_at: daysAgoISO(0) })],
        [],
      );
      expect(items).toHaveLength(0);
    });

    it("has no effect when acknowledged_at is older than updated_at", () => {
      const items = buildStaleItems(
        [makeDeadline({ status: "Not Started", updated_at: daysAgoISO(10), acknowledged_at: daysAgoISO(30) })],
        [],
      );
      expect(items).toHaveLength(1);
      expect(items[0].daysSinceUpdate).toBe(10);
    });
  });
});
