import { describe, expect, it } from "vitest";
import { buildGmailQuery, buildGraphFilter, clampTriageDays, triageSince } from "@/lib/email-triage/range";

describe("clampTriageDays", () => {
  it("defaults to 7 when missing or not a number", () => {
    expect(clampTriageDays(null)).toBe(7);
    expect(clampTriageDays(undefined)).toBe(7);
    expect(clampTriageDays(Number.NaN)).toBe(7);
  });

  it("clamps to 1..30 and rounds", () => {
    expect(clampTriageDays(0)).toBe(1);
    expect(clampTriageDays(-5)).toBe(1);
    expect(clampTriageDays(3)).toBe(3);
    expect(clampTriageDays(2.6)).toBe(3);
    expect(clampTriageDays(99)).toBe(30);
  });
});

describe("range queries", () => {
  const now = new Date("2026-10-11T16:00:00Z");

  it("computes the since instant N days back", () => {
    expect(triageSince(now, 3).toISOString()).toBe("2026-10-08T16:00:00.000Z");
  });

  it("builds a Gmail query for unread inbox mail after the instant, in epoch seconds", () => {
    const since = triageSince(now, 1);
    expect(buildGmailQuery(since)).toBe(`in:inbox is:unread after:${Math.floor(since.getTime() / 1000)}`);
  });

  it("builds a Graph filter that leads with receivedDateTime and drops milliseconds", () => {
    const filter = buildGraphFilter(triageSince(now, 1));
    expect(filter).toBe("receivedDateTime ge 2026-10-10T16:00:00Z and isRead eq false");
  });
});
