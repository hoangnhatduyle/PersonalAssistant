import { describe, expect, it } from "vitest";
import { buildCompletionTrend } from "../completion-trend";
import { makeDeadline, makeTask } from "./fixtures";

function daysAgoISO(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

describe("buildCompletionTrend", () => {
  it("buckets completed deadlines and done tasks by day, oldest first", () => {
    const trend = buildCompletionTrend(
      [makeDeadline({ status: "Completed", updated_at: daysAgoISO(0) })],
      [makeTask({ status: "Done", updated_at: daysAgoISO(0) })],
      7,
    );
    expect(trend).toHaveLength(7);
    expect(trend[6]).toBe(2);
  });

  it("places yesterday's completion one bucket before today's", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", updated_at: daysAgoISO(1) })], [], 7);
    expect(trend[5]).toBe(1);
    expect(trend[6]).toBe(0);
  });

  it("ignores items outside the trailing window", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", updated_at: daysAgoISO(30) })], [], 7);
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("ignores non-terminal statuses", () => {
    const trend = buildCompletionTrend(
      [makeDeadline({ status: "In Progress", updated_at: daysAgoISO(0) })],
      [makeTask({ status: "Open", updated_at: daysAgoISO(0) })],
      7,
    );
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});
