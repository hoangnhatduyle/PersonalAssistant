import { describe, expect, it } from "vitest";
import { buildWeeklyReview } from "@/lib/weekly-review/build-weekly-review";
import { toNarrativeInput } from "@/lib/weekly-review/generate-narrative";
import { buildRecommendations } from "@/lib/weekly-review/recommendations";
import { buildPlainSummary } from "@/lib/weekly-review/summary";
import { resolveWeeklyReviewWindow } from "@/lib/weekly-review/week-window";
import { makeDeadline } from "@/lib/dashboard/__tests__/fixtures";
import type { ReviewEmail, WeeklyReviewRows } from "@/lib/weekly-review/types";

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

function emails(count: number): ReviewEmail[] {
  return Array.from({ length: count }, (_, index) => ({
    subject: `Subject ${index + 1}`,
    sender: "Prof <prof@u.edu>",
    bucket: index === 0 ? ("needs_action" as const) : ("important" as const),
  }));
}

describe("weekly review: unresolved emails", () => {
  it("omits the section entirely when there are none (output identical to before the feature)", () => {
    expect(dataFor({}).pending).not.toHaveProperty("unresolvedEmails");
    expect(dataFor({ unresolvedEmails: [] }).pending).not.toHaveProperty("unresolvedEmails");
  });

  it("reports the total count but only the first five items", () => {
    const data = dataFor({ unresolvedEmails: emails(8) });
    expect(data.pending.unresolvedEmails?.count).toBe(8);
    expect(data.pending.unresolvedEmails?.items.map((email) => email.subject)).toEqual([
      "Subject 1",
      "Subject 2",
      "Subject 3",
      "Subject 4",
      "Subject 5",
    ]);
  });

  it("adds a count-only sentence to the plain summary, with singular and plural phrasing", () => {
    expect(buildPlainSummary(dataFor({ unresolvedEmails: emails(1) }))).toContain("You also have 1 unresolved email from your latest email check.");
    expect(buildPlainSummary(dataFor({ unresolvedEmails: emails(3) }))).toContain("You also have 3 unresolved emails from your latest email check.");
    expect(buildPlainSummary(dataFor({}))).not.toContain("unresolved email");
  });

  it("never puts a subject or sender in the spoken summary", () => {
    const summary = buildPlainSummary(dataFor({ unresolvedEmails: emails(2) }));
    expect(summary).not.toContain("Subject 1");
    expect(summary).not.toContain("prof@u.edu");
  });

  it("recommends going through emails only when a slot is free, after the fallback", () => {
    expect(buildRecommendations(dataFor({ unresolvedEmails: emails(2) }))).toEqual([
      "Nothing is due next week, so it's a good window to get ahead on longer-term work.",
      "Go through 2 emails from your latest check that still need attention.",
    ]);

    const crowded = dataFor({
      unresolvedEmails: emails(2),
      deadlines: [
        makeDeadline({ id: "late", title: "Homework 3", due_at: "2026-10-08T16:00:00Z" }),
        makeDeadline({ id: "next", title: "Term Paper", due_at: "2026-10-14T16:00:00Z" }),
      ],
    });
    const recommendations = buildRecommendations(crowded);
    expect(recommendations).toHaveLength(2);
    expect(recommendations.join(" ")).not.toContain("emails");
  });

  it("uses singular grammar for a single email", () => {
    expect(buildRecommendations(dataFor({ unresolvedEmails: emails(1) }))[1]).toBe(
      "Go through 1 email from your latest check that still needs attention.",
    );
  });
});

describe("toNarrativeInput (what the narrative LLM call receives)", () => {
  it("replaces email subjects and senders with a bare count", () => {
    const data = dataFor({ unresolvedEmails: emails(2) });
    const input = JSON.stringify(toNarrativeInput(data));

    expect(input).not.toContain("Subject 1");
    expect(input).not.toContain("prof@u.edu");
    expect(input).not.toContain("unresolvedEmails");
    expect(JSON.parse(input).pending.unresolvedEmailCount).toBe(2);
  });

  it("leaves a review with no emails untouched", () => {
    const data = dataFor({});
    expect(toNarrativeInput(data)).toEqual(data);
    expect(JSON.stringify(toNarrativeInput(data))).not.toContain("unresolvedEmailCount");
  });
});
