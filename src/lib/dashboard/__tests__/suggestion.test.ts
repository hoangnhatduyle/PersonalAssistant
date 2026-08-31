import { describe, expect, it } from "vitest";
import { buildSuggestion } from "../suggestion";
import { makeDeadline, makeTask } from "./fixtures";

const now = new Date("2026-01-10T12:00:00Z");

describe("buildSuggestion", () => {
  it("prioritizes an overdue deadline above everything else", () => {
    const result = buildSuggestion([makeDeadline({ status: "Overdue", title: "Lab report", due_at: "2026-01-09T00:00:00Z" })], [], now);
    expect(result.tone).toBe("urgent");
    expect(result.message).toContain("Lab report");
    expect(result.message).toContain("overdue");
  });

  it("mentions the count of additional overdue items", () => {
    const result = buildSuggestion(
      [
        makeDeadline({ id: "d-1", status: "Overdue", title: "A", due_at: "2026-01-09T00:00:00Z" }),
        makeDeadline({ id: "d-2", status: "Overdue", title: "B", due_at: "2026-01-08T00:00:00Z" }),
      ],
      [],
      now,
    );
    expect(result.message).toContain("+1 more overdue");
  });

  it("warns when the nearest deadline is within 48 hours", () => {
    const result = buildSuggestion([makeDeadline({ status: "Not Started", title: "Quiz", due_at: "2026-01-11T12:00:00Z" })], [], now);
    expect(result.tone).toBe("warn");
    expect(result.message).toContain("Quiz");
  });

  it("stays calm when the nearest deadline is more than 48 hours out", () => {
    const result = buildSuggestion([makeDeadline({ status: "Not Started", title: "Final", due_at: "2026-01-20T12:00:00Z" })], [], now);
    expect(result.tone).toBe("ok");
  });

  it("mentions open tasks when there are no deadlines at all", () => {
    const result = buildSuggestion([], [makeTask({ status: "Open" })], now);
    expect(result.tone).toBe("ok");
    expect(result.message).toContain("1 open task");
  });

  it("falls back to a calm message when there is nothing at all", () => {
    const result = buildSuggestion([], [], now);
    expect(result.message).toBe("You're all caught up — nothing urgent on deck.");
  });
});
