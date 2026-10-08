import { describe, expect, it } from "vitest";
import { resolveWeeklyReviewWindow, weekdayName } from "@/lib/weekly-review/week-window";

describe("resolveWeeklyReviewWindow", () => {
  it("covers the 7 local days ending today and the 7 starting tomorrow", () => {
    const window = resolveWeeklyReviewWindow(new Date("2026-10-11T16:00:00Z"), "America/New_York");
    expect(window.todayKey).toBe("2026-10-11");
    expect(window.lastStartKey).toBe("2026-10-05");
    expect(window.nextStartKey).toBe("2026-10-12");
    expect(window.nextEndKeyExclusive).toBe("2026-10-19");
    expect(window.lastStartUtc.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(window.todayStartUtc.toISOString()).toBe("2026-10-11T04:00:00.000Z");
    expect(window.tomorrowStartUtc.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(window.nextEndUtcExclusive.toISOString()).toBe("2026-10-19T04:00:00.000Z");
  });

  it("uses the user's calendar day when the UTC date has already rolled over", () => {
    // 10pm Sunday in New York is already Monday in UTC.
    const window = resolveWeeklyReviewWindow(new Date("2026-10-12T02:00:00Z"), "America/New_York");
    expect(window.todayKey).toBe("2026-10-11");
    expect(window.nextStartKey).toBe("2026-10-12");
  });

  it("keeps local midnights correct across the end of daylight saving time", () => {
    // DST ended Sunday 2026-11-01 in New York: midnights move from -04:00 to -05:00.
    const window = resolveWeeklyReviewWindow(new Date("2026-11-02T15:00:00Z"), "America/New_York");
    expect(window.lastStartKey).toBe("2026-10-27");
    expect(window.lastStartUtc.toISOString()).toBe("2026-10-27T04:00:00.000Z");
    expect(window.tomorrowStartUtc.toISOString()).toBe("2026-11-03T05:00:00.000Z");
  });

  it("never overlaps the two windows", () => {
    const window = resolveWeeklyReviewWindow(new Date("2026-10-11T16:00:00Z"), "UTC");
    expect(window.tomorrowStartUtc.getTime()).toBe(window.todayStartUtc.getTime() + 24 * 60 * 60 * 1000);
    expect(window.nextStartKey > window.todayKey).toBe(true);
  });
});

describe("weekdayName", () => {
  it("names the weekday for a date key", () => {
    expect(weekdayName("2026-10-11")).toBe("Sunday");
    expect(weekdayName("2026-10-13")).toBe("Tuesday");
  });
});
