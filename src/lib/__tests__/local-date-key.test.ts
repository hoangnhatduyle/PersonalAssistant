import { describe, expect, it } from "vitest";
import { localDateKey } from "@/lib/local-date-key";

describe("localDateKey", () => {
  it("formats the local calendar date with zero padding", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("uses local time, not UTC, late in the evening", () => {
    expect(localDateKey(new Date(2026, 10, 9, 23, 30))).toBe("2026-11-09");
  });
});
