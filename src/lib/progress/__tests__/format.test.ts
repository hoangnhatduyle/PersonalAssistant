import { describe, expect, it } from "vitest";
import { formatEstimateHours } from "../format";

describe("formatEstimateHours", () => {
  it("shows whole and fractional hours compactly", () => {
    expect(formatEstimateHours(8)).toBe("8 h");
    expect(formatEstimateHours(2.5)).toBe("2.5 h");
    expect(formatEstimateHours(0.25)).toBe("15 min");
    expect(formatEstimateHours(0.75)).toBe("45 min");
  });

  it("drops trailing zeros from the stored 2-decimal value", () => {
    expect(formatEstimateHours(3.5)).toBe("3.5 h");
    expect(formatEstimateHours(1.25)).toBe("1.25 h");
  });

  it("is empty when there is no estimate", () => {
    expect(formatEstimateHours(null)).toBe("");
    expect(formatEstimateHours(undefined)).toBe("");
  });
});
