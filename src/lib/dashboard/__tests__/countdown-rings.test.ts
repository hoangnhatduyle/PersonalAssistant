import { describe, expect, it } from "vitest";
import { formatRingCountdown, isRingOverdue, ringFillFraction } from "../countdown-rings";

const now = new Date("2026-01-10T12:00:00Z");

function hoursFromNow(hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

describe("ringFillFraction", () => {
  it("is fully filled for an item due exactly now", () => {
    expect(ringFillFraction(now, now)).toBe(1);
  });

  it("is fully filled for an item overdue by 12 days", () => {
    const twelveDaysAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
    expect(ringFillFraction(twelveDaysAgo, now)).toBe(1);
  });

  it("is empty for an item due beyond the 24h window", () => {
    expect(ringFillFraction(hoursFromNow(25), now)).toBe(0);
  });

  it("is empty for an item due exactly at the window boundary", () => {
    expect(ringFillFraction(hoursFromNow(24), now)).toBe(0);
  });

  it("is roughly half-filled for an item due in 12 hours", () => {
    expect(ringFillFraction(hoursFromNow(12), now)).toBeCloseTo(0.5, 5);
  });

  it("is mostly filled for an item due in 1 hour", () => {
    expect(ringFillFraction(hoursFromNow(1), now)).toBeCloseTo(1 - 1 / 24, 5);
  });
});

describe("isRingOverdue", () => {
  it("is true for a past timestamp", () => {
    expect(isRingOverdue(hoursFromNow(-1), now)).toBe(true);
  });

  it("is true for the exact current timestamp", () => {
    expect(isRingOverdue(now, now)).toBe(true);
  });

  it("is false for a future timestamp", () => {
    expect(isRingOverdue(hoursFromNow(1), now)).toBe(false);
  });
});

describe("formatRingCountdown", () => {
  it("labels an overdue item as PAST DUE regardless of how overdue", () => {
    expect(formatRingCountdown(hoursFromNow(-1), now)).toBe("PAST DUE");
    const twelveDaysAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
    expect(formatRingCountdown(twelveDaysAgo, now)).toBe("PAST DUE");
  });

  it("falls back to the relative-time label for upcoming items", () => {
    expect(formatRingCountdown(hoursFromNow(4), now)).toBe("in 4h");
  });
});
