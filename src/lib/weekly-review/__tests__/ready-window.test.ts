import { describe, expect, it } from "vitest";
import { isWeeklyReviewReady } from "@/lib/weekly-review/ready-window";

describe("isWeeklyReviewReady", () => {
  it("is ready Sunday from 5pm through Monday before noon in the user's timezone", () => {
    expect(isWeeklyReviewReady(new Date("2026-10-11T20:59:00Z"), "America/New_York")).toBe(false); // Sun 4:59pm
    expect(isWeeklyReviewReady(new Date("2026-10-11T21:00:00Z"), "America/New_York")).toBe(true); // Sun 5:00pm
    expect(isWeeklyReviewReady(new Date("2026-10-12T15:59:00Z"), "America/New_York")).toBe(true); // Mon 11:59am
    expect(isWeeklyReviewReady(new Date("2026-10-12T16:00:00Z"), "America/New_York")).toBe(false); // Mon noon
  });

  it("is not ready midweek", () => {
    expect(isWeeklyReviewReady(new Date("2026-10-14T18:00:00Z"), "America/New_York")).toBe(false);
  });

  it("uses the timezone, not UTC", () => {
    // Saturday 10pm in New York is already Sunday 02:00 UTC, but it is neither Sunday evening there nor here.
    expect(isWeeklyReviewReady(new Date("2026-10-11T02:00:00Z"), "America/New_York")).toBe(false); // Sat 10pm NY, Sun 2am UTC
    expect(isWeeklyReviewReady(new Date("2026-10-11T02:00:00Z"), "UTC")).toBe(false);
  });
});
