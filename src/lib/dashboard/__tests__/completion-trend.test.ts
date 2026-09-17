import { describe, expect, it } from "vitest";
import {
  buildCompletionTrend,
  buildCompletedThisWeek,
  buildCycleTimeStats,
  buildOnTimeCompletionRate,
  buildNetBacklogDelta,
  buildCycleTimeSparkline,
} from "../completion-trend";
import { makeDeadline, makeTask } from "./fixtures";

function daysAgoISO(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

describe("buildCompletionTrend", () => {
  it("buckets completed deadlines and done tasks by day, oldest first", () => {
    const trend = buildCompletionTrend(
      [makeDeadline({ status: "Completed", completed_at: daysAgoISO(0) })],
      [makeTask({ status: "Done", completed_at: daysAgoISO(0) })],
      7,
    );
    expect(trend).toHaveLength(7);
    expect(trend[6]).toBe(2);
  });

  it("places yesterday's completion one bucket before today's", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", completed_at: daysAgoISO(1) })], [], 7);
    expect(trend[5]).toBe(1);
    expect(trend[6]).toBe(0);
  });

  it("ignores items outside the trailing window", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", completed_at: daysAgoISO(30) })], [], 7);
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("ignores non-terminal statuses", () => {
    const trend = buildCompletionTrend(
      [makeDeadline({ status: "In Progress", completed_at: null })],
      [makeTask({ status: "Open", completed_at: null })],
      7,
    );
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("ignores terminal-status rows with no completed_at (unbackfilled batch-write rows)", () => {
    const trend = buildCompletionTrend([makeDeadline({ status: "Completed", completed_at: null })], [makeTask({ status: "Done", completed_at: null })], 7);
    expect(trend.reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});

describe("buildCompletedThisWeek", () => {
  it("returns the actual completed rows within the window, most-recent-first", () => {
    const items = buildCompletedThisWeek(
      [makeDeadline({ id: "d-old", title: "Older deadline", status: "Completed", completed_at: daysAgoISO(2) })],
      [makeTask({ id: "t-new", title: "Newer task", status: "Done", completed_at: daysAgoISO(0) })],
      7,
    );
    expect(items.map((item) => item.id)).toEqual(["t-new", "d-old"]);
    expect(items[0]).toMatchObject({ kind: "task", title: "Newer task", href: "/board/t-new" });
    expect(items[1]).toMatchObject({ kind: "deadline", title: "Older deadline", href: "/courses/deadlines/d-old" });
  });

  it("excludes non-terminal statuses and items outside the trailing window", () => {
    const items = buildCompletedThisWeek(
      [
        makeDeadline({ id: "d-in-progress", status: "In Progress", completed_at: null }),
        makeDeadline({ id: "d-too-old", status: "Completed", completed_at: daysAgoISO(30) }),
      ],
      [makeTask({ id: "t-open", status: "Open", completed_at: null })],
      7,
    );
    expect(items).toHaveLength(0);
  });
});

describe("buildCycleTimeStats", () => {
  it("computes this week's avg cycle time from created_at to completed_at", () => {
    const stats = buildCycleTimeStats(
      [makeDeadline({ status: "Completed", created_at: daysAgoISO(5), completed_at: daysAgoISO(2) })],
      [],
    );
    expect(stats.thisWeekAvgDays).toBeCloseTo(3, 0);
  });

  it("buckets this-week and last-week completions independently and computes the delta", () => {
    const stats = buildCycleTimeStats(
      [makeDeadline({ id: "d-this-week", status: "Completed", created_at: daysAgoISO(4), completed_at: daysAgoISO(1) })],
      [makeTask({ id: "t-last-week", status: "Done", created_at: daysAgoISO(13), completed_at: daysAgoISO(9) })],
    );
    expect(stats.thisWeekAvgDays).toBeCloseTo(3, 0);
    expect(stats.lastWeekAvgDays).toBeCloseTo(4, 0);
    expect(stats.deltaDays).toBeCloseTo(-1, 0);
  });

  it("returns null for an empty bucket and a null delta when only one side has data", () => {
    const stats = buildCycleTimeStats([makeDeadline({ status: "Completed", created_at: daysAgoISO(3), completed_at: daysAgoISO(0) })], []);
    expect(stats.lastWeekAvgDays).toBeNull();
    expect(stats.deltaDays).toBeNull();
  });

  it("ignores non-terminal statuses", () => {
    const stats = buildCycleTimeStats([makeDeadline({ status: "In Progress", completed_at: null })], []);
    expect(stats.thisWeekAvgDays).toBeNull();
  });

  it("ignores terminal-status rows with no completed_at (unbackfilled batch-write rows)", () => {
    const stats = buildCycleTimeStats([makeDeadline({ status: "Completed", created_at: daysAgoISO(3), completed_at: null })], []);
    expect(stats.thisWeekAvgDays).toBeNull();
  });
});

describe("buildOnTimeCompletionRate", () => {
  it("counts a completion finished before its due_at as on-time", () => {
    const stats = buildOnTimeCompletionRate(
      [makeDeadline({ status: "Completed", completed_at: daysAgoISO(2), due_at: daysAgoISO(1) })],
      [],
    );
    expect(stats.rate).toBe(100);
    expect(stats.onTimeCount).toBe(1);
    expect(stats.eligibleCount).toBe(1);
  });

  it("counts a completion finished after its due_at as late", () => {
    const stats = buildOnTimeCompletionRate(
      [makeDeadline({ status: "Completed", completed_at: daysAgoISO(1), due_at: daysAgoISO(3) })],
      [],
    );
    expect(stats.rate).toBe(0);
    expect(stats.onTimeCount).toBe(0);
    expect(stats.eligibleCount).toBe(1);
  });

  it("excludes tasks with no due_at from eligibleCount but still counts them as completed", () => {
    const stats = buildOnTimeCompletionRate([], [makeTask({ status: "Done", completed_at: daysAgoISO(0), due_at: null })]);
    expect(stats.eligibleCount).toBe(0);
    expect(stats.completedCount).toBe(1);
    expect(stats.rate).toBeNull();
  });

  it("returns a null rate when there are zero eligible completions", () => {
    const stats = buildOnTimeCompletionRate([], []);
    expect(stats.rate).toBeNull();
  });

  it("excludes terminal-status rows with no completed_at (unbackfilled batch-write rows)", () => {
    const stats = buildOnTimeCompletionRate([], [makeTask({ status: "Done", completed_at: null, due_at: daysAgoISO(1) })]);
    expect(stats.completedCount).toBe(0);
    expect(stats.eligibleCount).toBe(0);
  });
});

describe("buildNetBacklogDelta", () => {
  it("computes completions minus new items created this week", () => {
    const delta = buildNetBacklogDelta(
      [makeDeadline({ id: "d-completed", status: "Completed", created_at: daysAgoISO(30), completed_at: daysAgoISO(0) })],
      [
        makeTask({ id: "t-completed", status: "Done", created_at: daysAgoISO(30), completed_at: daysAgoISO(0) }),
        makeTask({ id: "t-created", status: "Open", created_at: daysAgoISO(0), completed_at: null }),
      ],
    );
    expect(delta.completedCount).toBe(2);
    expect(delta.createdCount).toBe(1);
    expect(delta.delta).toBe(1);
  });

  it("goes negative when more items are created than completed", () => {
    const delta = buildNetBacklogDelta(
      [],
      [
        makeTask({ id: "t-1", status: "Open", created_at: daysAgoISO(0), completed_at: null }),
        makeTask({ id: "t-2", status: "Open", created_at: daysAgoISO(1), completed_at: null }),
        makeTask({ id: "t-3", status: "Done", created_at: daysAgoISO(0), completed_at: daysAgoISO(0) }),
      ],
    );
    expect(delta.createdCount).toBe(3);
    expect(delta.completedCount).toBe(1);
    expect(delta.delta).toBe(-2);
  });

  it("excludes items outside the trailing window from both sides", () => {
    const delta = buildNetBacklogDelta(
      [],
      [makeTask({ status: "Open", created_at: daysAgoISO(30), completed_at: daysAgoISO(30) })],
    );
    expect(delta.completedCount).toBe(0);
    expect(delta.createdCount).toBe(0);
  });
});

describe("buildCycleTimeSparkline", () => {
  it("places a single completion's cycle time in its day's bucket", () => {
    const sparkline = buildCycleTimeSparkline(
      [makeDeadline({ status: "Completed", created_at: daysAgoISO(3), completed_at: daysAgoISO(0) })],
      [],
      7,
    );
    expect(sparkline).toHaveLength(7);
    expect(sparkline[6]).toBeCloseTo(3, 0);
    expect(sparkline.slice(0, 6).every((value) => value === 0)).toBe(true);
  });

  it("averages same-day completions instead of summing them", () => {
    const sparkline = buildCycleTimeSparkline(
      [
        makeDeadline({ id: "d-1", status: "Completed", created_at: daysAgoISO(2), completed_at: daysAgoISO(0) }),
        makeDeadline({ id: "d-2", status: "Completed", created_at: daysAgoISO(4), completed_at: daysAgoISO(0) }),
      ],
      [],
      7,
    );
    expect(sparkline[6]).toBeCloseTo(3, 0);
  });

  it("always returns exactly `days` buckets", () => {
    expect(buildCycleTimeSparkline([], [], 7)).toHaveLength(7);
    expect(buildCycleTimeSparkline([], [], 14)).toHaveLength(14);
  });
});
