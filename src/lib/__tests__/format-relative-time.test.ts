import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../format-relative-time";

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("formats minutes for near-future times", () => {
    expect(formatRelativeTime(new Date("2026-01-01T12:30:00Z"), now)).toBe("in 30m");
  });

  it("formats hours once past 60 minutes", () => {
    expect(formatRelativeTime(new Date("2026-01-01T15:00:00Z"), now)).toBe("in 3h");
  });

  it("formats days once past 24 hours", () => {
    expect(formatRelativeTime(new Date("2026-01-04T12:00:00Z"), now)).toBe("in 3d");
  });

  it("formats past times with 'ago'", () => {
    expect(formatRelativeTime(new Date("2026-01-01T10:00:00Z"), now)).toBe("2h ago");
  });

  it("treats a target equal to now as 'in 0m'", () => {
    expect(formatRelativeTime(now, now)).toBe("in 0m");
  });
});
