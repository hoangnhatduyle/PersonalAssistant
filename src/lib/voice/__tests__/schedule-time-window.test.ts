import { describe, expect, it } from "vitest";
import { resolveScheduleWindowBounds } from "../schedule-time-window";

describe("resolveScheduleWindowBounds", () => {
  it("returns null for 'unscoped' (no filtering)", () => {
    expect(resolveScheduleWindowBounds("unscoped", "America/Chicago", new Date("2026-09-02T20:00:00Z"))).toBeNull();
  });

  it("computes today's bounds against the user's real IANA timezone, not the server's local time (America/Chicago, CDT)", () => {
    // 2026-09-02 is within Central Daylight Time (UTC-5): 3pm UTC = 10am CDT, still Sep 2 locally.
    const now = new Date("2026-09-02T20:00:00Z");
    const bounds = resolveScheduleWindowBounds("today", "America/Chicago", now);
    expect(bounds).toEqual({
      startUtcIso: "2026-09-02T05:00:00.000Z",
      endUtcIsoExclusive: "2026-09-03T05:00:00.000Z",
    });
  });

  it("computes tomorrow's bounds as the next 24h block after today's", () => {
    const now = new Date("2026-09-02T20:00:00Z");
    const bounds = resolveScheduleWindowBounds("tomorrow", "America/Chicago", now);
    expect(bounds).toEqual({
      startUtcIso: "2026-09-03T05:00:00.000Z",
      endUtcIsoExclusive: "2026-09-04T05:00:00.000Z",
    });
  });

  it("computes a 7-day week window starting at today's local midnight", () => {
    const now = new Date("2026-09-02T20:00:00Z");
    const bounds = resolveScheduleWindowBounds("week", "America/Chicago", now);
    expect(bounds!.startUtcIso).toBe("2026-09-02T05:00:00.000Z");
    expect(bounds!.endUtcIsoExclusive).toBe("2026-09-09T05:00:00.000Z");
  });

  it("computes correct bounds for UTC itself", () => {
    const now = new Date("2026-09-02T15:00:00Z");
    const bounds = resolveScheduleWindowBounds("today", "UTC", now);
    expect(bounds).toEqual({
      startUtcIso: "2026-09-02T00:00:00.000Z",
      endUtcIsoExclusive: "2026-09-03T00:00:00.000Z",
    });
  });

  it("computes correct bounds for a half-hour-offset timezone (Asia/Kolkata, UTC+5:30)", () => {
    const now = new Date("2026-09-02T10:00:00Z"); // 15:30 IST, still Sep 2 locally
    const bounds = resolveScheduleWindowBounds("today", "Asia/Kolkata", now);
    expect(bounds).toEqual({
      startUtcIso: "2026-09-01T18:30:00.000Z",
      endUtcIsoExclusive: "2026-09-02T18:30:00.000Z",
    });
  });

  it("computes correct bounds on the far side of a DST transition (America/Chicago switches to CST on 2026-11-01)", () => {
    // 2026-11-02 is fully within Central Standard Time (UTC-6).
    const now = new Date("2026-11-02T15:00:00Z"); // 9am CST
    const bounds = resolveScheduleWindowBounds("today", "America/Chicago", now);
    expect(bounds).toEqual({
      startUtcIso: "2026-11-02T06:00:00.000Z",
      endUtcIsoExclusive: "2026-11-03T06:00:00.000Z",
    });
  });

  it("defaults `now` to the current instant when omitted", () => {
    const bounds = resolveScheduleWindowBounds("today", "UTC");
    expect(bounds).not.toBeNull();
    expect(new Date(bounds!.startUtcIso).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(bounds!.endUtcIsoExclusive).getTime()).toBeGreaterThan(Date.now());
  });
});
