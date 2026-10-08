import { describe, expect, it } from "vitest";
import { buildWeeklyReview } from "@/lib/weekly-review/build-weekly-review";
import { resolveWeeklyReviewWindow } from "@/lib/weekly-review/week-window";
import type { WeeklyReviewRows } from "@/lib/weekly-review/types";
import { makeDeadline, makeTask } from "@/lib/dashboard/__tests__/fixtures";

// Sunday noon in New York.
const NOW = new Date("2026-10-11T16:00:00Z");
const TZ = "America/New_York";

function rowsWith(overrides: Partial<WeeklyReviewRows>): WeeklyReviewRows {
  return {
    deadlines: [],
    tasks: [],
    sessions: [],
    sessionsForUpcomingDeadlines: [],
    courseNameById: new Map([["c-1", "Machine Learning"]]),
    ...overrides,
  };
}

function review(overrides: Partial<WeeklyReviewRows>) {
  return buildWeeklyReview(rowsWith(overrides), resolveWeeklyReviewWindow(NOW, TZ), NOW);
}

describe("buildWeeklyReview: last week", () => {
  it("counts completions by completed_at and judges on-time against due_at", () => {
    const data = review({
      deadlines: [
        makeDeadline({ id: "on-time", due_at: "2026-10-07T16:00:00Z", status: "Completed", completed_at: "2026-10-07T10:00:00Z" }),
        makeDeadline({ id: "late", due_at: "2026-10-08T16:00:00Z", status: "Completed", completed_at: "2026-10-09T10:00:00Z" }),
        makeDeadline({ id: "missed", due_at: "2026-10-09T16:00:00Z", status: "In Progress" }),
      ],
      tasks: [makeTask({ id: "undated", due_at: null, status: "Done", completed_at: "2026-10-10T12:00:00Z" })],
    });

    expect(data.lastWeek).toMatchObject({ completedCount: 3, dueCount: 3, completedOnTime: 1, completedLate: 1, stillOpen: 1, onTimeRate: 50 });
  });

  it("ignores Cancelled items and open items not yet due", () => {
    const data = review({
      deadlines: [makeDeadline({ id: "cancelled", due_at: "2026-10-06T16:00:00Z", status: "Cancelled" })],
      // Due 6pm today; it is noon, so this is not a miss yet.
      tasks: [makeTask({ id: "tonight", due_at: "2026-10-11T22:00:00Z", status: "Open" })],
    });

    expect(data.lastWeek.dueCount).toBe(0);
    expect(data.lastWeek.onTimeRate).toBeNull();
    expect(data.pending.dueTodayCount).toBe(1);
  });

  it("does not count a completion outside the window or one with no completed_at", () => {
    const data = review({
      deadlines: [
        makeDeadline({ id: "old", status: "Completed", due_at: "2026-09-20T16:00:00Z", completed_at: "2026-09-21T10:00:00Z" }),
        makeDeadline({ id: "no-stamp", status: "Completed", due_at: "2026-10-08T16:00:00Z", completed_at: null }),
      ],
    });

    expect(data.lastWeek.completedCount).toBe(0);
    // Done and due in the window, but no timestamp to judge: counted as done, not as on time or late.
    expect(data.lastWeek).toMatchObject({ dueCount: 1, completedOnTime: 0, completedLate: 0, stillOpen: 0, onTimeRate: null });
  });

  it("tallies sessions in the last window by status", () => {
    const data = review({
      sessions: [
        { deadline_id: "d-1", session_status: "done", date: "2026-10-06" },
        { deadline_id: "d-1", session_status: "done", date: "2026-10-07" },
        { deadline_id: "d-1", session_status: "skipped", date: "2026-10-08" },
        // Next window, not last week.
        { deadline_id: "d-1", session_status: "planned", date: "2026-10-13" },
      ],
    });

    expect(data.lastWeek.sessions).toEqual({ done: 2, skipped: 1, planned: 0 });
  });
});

describe("buildWeeklyReview: pending", () => {
  it("lists past-due items oldest first with days overdue in the user's timezone", () => {
    const data = review({
      deadlines: [
        makeDeadline({ id: "recent", title: "Recent", due_at: "2026-10-09T16:00:00Z", status: "In Progress" }),
        makeDeadline({ id: "ancient", title: "Ancient", due_at: "2026-09-20T16:00:00Z", status: "Not Started" }),
      ],
    });

    expect(data.pending.pastDueCount).toBe(2);
    expect(data.pending.pastDueItems.map((item) => [item.title, item.daysOverdue])).toEqual([
      ["Ancient", 21],
      ["Recent", 2],
    ]);
    expect(data.pending.pastDueItems[0].context).toBe("Machine Learning");
  });

  it("does not treat something due earlier today as past due", () => {
    const data = review({ tasks: [makeTask({ due_at: "2026-10-11T14:00:00Z", status: "Open" })] });
    expect(data.pending.pastDueCount).toBe(0);
    expect(data.pending.dueTodayCount).toBe(1);
  });
});

describe("buildWeeklyReview: next week", () => {
  const nextWeekRows = (): Partial<WeeklyReviewRows> => ({
    deadlines: [
      makeDeadline({ id: "n1", title: "N1", due_at: "2026-10-13T20:00:00Z" }),
      makeDeadline({ id: "n2", title: "N2", due_at: "2026-10-13T21:00:00Z" }),
      makeDeadline({ id: "n4", title: "N4", due_at: "2026-10-15T20:00:00Z" }),
      // Beyond the 7-day window.
      makeDeadline({ id: "far", title: "Far", due_at: "2026-10-25T20:00:00Z" }),
    ],
    tasks: [makeTask({ id: "nt", title: "NT", due_at: "2026-10-13T22:00:00Z", status: "Open" })],
    sessions: [{ deadline_id: "n1", session_status: "planned", date: "2026-10-13" }],
    sessionsForUpcomingDeadlines: [
      { deadline_id: "n1", session_status: "planned", date: "2026-10-13" },
      { deadline_id: "n2", session_status: "skipped", date: "2026-10-09" },
    ],
  });

  it("buckets open items per local day and flags pile-ups", () => {
    const data = review(nextWeekRows());

    expect(data.nextWeek.days).toHaveLength(7);
    expect(data.nextWeek.total).toBe(4);
    const tuesday = data.nextWeek.days.find((day) => day.dateKey === "2026-10-13")!;
    expect(tuesday).toMatchObject({ weekday: "Tuesday", deadlineCount: 2, taskCount: 1, sessionCount: 1, total: 3, titles: ["N1", "N2", "NT"] });
    expect(data.nextWeek.busiestDay?.dateKey).toBe("2026-10-13");
    expect(data.nextWeek.collisionDays.map((day) => day.weekday)).toEqual(["Tuesday"]);
    expect(data.nextWeek.items.map((item) => item.title)).toEqual(["N1", "N2", "NT", "N4"]);
  });

  it("flags deadlines that have no planned or done session; a skipped one does not cover", () => {
    const data = review(nextWeekRows());
    expect(data.nextWeek.deadlinesWithoutSessions.map((item) => item.title)).toEqual(["N2", "N4"]);
    expect(data.nextWeek.deadlinesWithoutSessions[0].weekday).toBe("Tuesday");
  });

  it("buckets by the user's calendar day, not UTC", () => {
    // 11pm Tuesday in New York is already Wednesday in UTC.
    const data = review({ deadlines: [makeDeadline({ due_at: "2026-10-14T03:00:00Z" })] });
    expect(data.nextWeek.days.find((day) => day.dateKey === "2026-10-13")?.total).toBe(1);
    expect(data.nextWeek.days.find((day) => day.dateKey === "2026-10-14")?.total).toBe(0);
  });

  it("handles an empty week", () => {
    const data = review({});
    expect(data.nextWeek).toMatchObject({ total: 0, busiestDay: null, collisionDays: [], items: [], deadlinesWithoutSessions: [] });
    expect(data.lastWeek.completedCount).toBe(0);
    expect(data.pending.pastDueCount).toBe(0);
  });
});
