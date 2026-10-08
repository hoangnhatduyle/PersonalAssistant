import { describe, expect, it } from "vitest";
import { buildRecommendations } from "@/lib/weekly-review/recommendations";
import { buildPlainSummary } from "@/lib/weekly-review/summary";
import { buildWeeklyReview } from "@/lib/weekly-review/build-weekly-review";
import { resolveWeeklyReviewWindow } from "@/lib/weekly-review/week-window";
import { makeDeadline, makeTask } from "@/lib/dashboard/__tests__/fixtures";
import type { WeeklyReviewRows } from "@/lib/weekly-review/types";

const NOW = new Date("2026-10-11T16:00:00Z");

function dataFor(overrides: Partial<WeeklyReviewRows>) {
  const rows: WeeklyReviewRows = {
    deadlines: [],
    tasks: [],
    sessions: [],
    sessionsForUpcomingDeadlines: [],
    courseNameById: new Map(),
    ...overrides,
  };
  return buildWeeklyReview(rows, resolveWeeklyReviewWindow(NOW, "America/New_York"), NOW);
}

describe("buildRecommendations", () => {
  it("puts past-due first and caps at two", () => {
    const data = dataFor({
      deadlines: [
        makeDeadline({ id: "late", title: "Homework 3", due_at: "2026-10-08T16:00:00Z" }),
        makeDeadline({ id: "next", title: "Term Paper", due_at: "2026-10-14T16:00:00Z" }),
        makeDeadline({ id: "next2", title: "Quiz", due_at: "2026-10-14T17:00:00Z" }),
      ],
      tasks: [makeTask({ due_at: "2026-10-14T18:00:00Z" })],
    });

    const recommendations = buildRecommendations(data);
    expect(recommendations).toHaveLength(2);
    expect(recommendations[0]).toBe('Clear or reschedule 1 past-due item, starting with "Homework 3".');
    expect(recommendations[1]).toBe('Plan study sessions for "Term Paper" before it\'s due Wednesday; none are scheduled yet.');
  });

  it("calls out a pile-up day when nothing else is wrong", () => {
    const data = dataFor({
      deadlines: [makeDeadline({ id: "a", title: "A", due_at: "2026-10-14T16:00:00Z" }), makeDeadline({ id: "b", title: "B", due_at: "2026-10-14T17:00:00Z" })],
      tasks: [makeTask({ title: "C", due_at: "2026-10-14T18:00:00Z" })],
      sessionsForUpcomingDeadlines: [
        { deadline_id: "a", session_status: "planned", date: "2026-10-12" },
        { deadline_id: "b", session_status: "planned", date: "2026-10-12" },
      ],
    });

    expect(buildRecommendations(data)).toEqual(['Wednesday has 3 items due, so start "A" a day or two early.']);
  });

  it("falls back to a light-week message", () => {
    expect(buildRecommendations(dataFor({}))[0]).toMatch(/Nothing is due next week/);
    const manageable = dataFor({
      tasks: [makeTask({ due_at: "2026-10-14T16:00:00Z" })],
    });
    expect(buildRecommendations(manageable)).toEqual(["Next week looks manageable. Keep your current pace."]);
  });
});

describe("buildPlainSummary", () => {
  it("is speech-safe: no ISO dates, weekday names and counts only", () => {
    const data = dataFor({
      deadlines: [
        makeDeadline({ id: "done", due_at: "2026-10-07T16:00:00Z", status: "Completed", completed_at: "2026-10-07T10:00:00Z" }),
        makeDeadline({ id: "late", title: "Homework 3", due_at: "2026-10-08T16:00:00Z" }),
        makeDeadline({ id: "next", due_at: "2026-10-14T16:00:00Z" }),
      ],
    });

    const summary = buildPlainSummary(data);
    expect(summary).toContain("you completed 1 item");
    expect(summary).toContain('The oldest is "Homework 3", 3 days overdue.');
    expect(summary).toContain("Wednesday the busiest at 1");
    expect(summary).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("handles a quiet week", () => {
    const summary = buildPlainSummary(dataFor({}));
    expect(summary).toBe("Over the past 7 days nothing was due and nothing was completed. Nothing is past due. Next week is clear.");
  });
});
