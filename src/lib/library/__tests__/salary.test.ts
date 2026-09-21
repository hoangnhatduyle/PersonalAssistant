import { describe, expect, it } from "vitest";
import { formatSalaryRange, isValidSalaryRange } from "@/lib/library/salary";

describe("isValidSalaryRange", () => {
  it("allows a missing side", () => {
    expect(isValidSalaryRange(null, null)).toBe(true);
    expect(isValidSalaryRange(50_000, null)).toBe(true);
    expect(isValidSalaryRange(null, 80_000)).toBe(true);
  });

  it("requires min <= max when both are set", () => {
    expect(isValidSalaryRange(50_000, 80_000)).toBe(true);
    expect(isValidSalaryRange(80_000, 80_000)).toBe(true);
    expect(isValidSalaryRange(90_000, 80_000)).toBe(false);
  });

  it("rejects negatives", () => {
    expect(isValidSalaryRange(-1, 10)).toBe(false);
    expect(isValidSalaryRange(null, -5)).toBe(false);
  });
});

describe("formatSalaryRange", () => {
  it("is null when there is no salary information", () => {
    expect(formatSalaryRange({ min: null, max: null, currency: "USD", period: "year" })).toBeNull();
  });

  it("formats a range with its period", () => {
    expect(formatSalaryRange({ min: 90_000, max: 120_000, currency: "USD", period: "year" })).toBe("$90K–$120K / yr");
  });

  it("collapses an equal range", () => {
    expect(formatSalaryRange({ min: 5_000, max: 5_000, currency: "USD", period: "month" })).toBe("$5K / mo");
  });

  it("handles open-ended ranges", () => {
    expect(formatSalaryRange({ min: 90_000, max: null, currency: "USD", period: "year" })).toBe("From $90K / yr");
    expect(formatSalaryRange({ min: null, max: 120_000, currency: "USD", period: "year" })).toBe("Up to $120K / yr");
  });

  it("omits the period when unset", () => {
    expect(formatSalaryRange({ min: 60, max: 80, currency: "USD", period: null })).toBe("$60–$80");
  });

  it("falls back to the raw code for an unknown currency and defaults to USD when blank", () => {
    expect(formatSalaryRange({ min: 1000, max: 2000, currency: "ZZZZ", period: "hour" })).toContain("ZZZZ");
    expect(formatSalaryRange({ min: 60, max: null, currency: null, period: "hour" })).toBe("From $60 / hr");
  });
});
