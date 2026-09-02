import { describe, expect, it } from "vitest";
import { resolveScheduleWindowBounds, resolveScheduleWindowDateKeys } from "../schedule-time-window";

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

describe("resolveScheduleWindowDateKeys", () => {
  it("returns null for 'unscoped'", () => {
    expect(resolveScheduleWindowDateKeys("unscoped", "America/Chicago", new Date("2026-09-02T20:00:00Z"))).toBeNull();
  });

  it("computes today's date-key bounds against the user's real timezone", () => {
    // 8pm UTC = 3pm CDT, still Sep 2 locally.
    const now = new Date("2026-09-02T20:00:00Z");
    expect(resolveScheduleWindowDateKeys("today", "America/Chicago", now)).toEqual({
      startDateKey: "2026-09-02",
      endDateKeyExclusive: "2026-09-03",
    });
  });

  it("agrees with resolveScheduleWindowBounds's calendar day near a timezone that would differ from UTC's own date", () => {
    // 2am UTC on Sep 3 is still 9pm CDT on Sep 2 -- a case where the UTC
    // calendar date and the user's local calendar date disagree, the exact
    // scenario this date-key resolver exists to get right for a `date`
    // column that has no timezone of its own.
    const now = new Date("2026-09-03T02:00:00Z");
    expect(resolveScheduleWindowDateKeys("today", "America/Chicago", now)).toEqual({
      startDateKey: "2026-09-02",
      endDateKeyExclusive: "2026-09-03",
    });
  });

  it("computes tomorrow's date-key bounds as the next single day", () => {
    const now = new Date("2026-09-02T20:00:00Z");
    expect(resolveScheduleWindowDateKeys("tomorrow", "America/Chicago", now)).toEqual({
      startDateKey: "2026-09-03",
      endDateKeyExclusive: "2026-09-04",
    });
  });

  it("computes a 7-day week date-key span starting today", () => {
    const now = new Date("2026-09-02T20:00:00Z");
    expect(resolveScheduleWindowDateKeys("week", "America/Chicago", now)).toEqual({
      startDateKey: "2026-09-02",
      endDateKeyExclusive: "2026-09-09",
    });
  });

  it("is unaffected by a DST transition (pure calendar-day arithmetic, no instant conversion)", () => {
    const now = new Date("2026-10-30T15:00:00Z"); // Oct 30, before the Nov 1 DST transition
    expect(resolveScheduleWindowDateKeys("week", "America/Chicago", now)).toEqual({
      startDateKey: "2026-10-30",
      endDateKeyExclusive: "2026-11-06",
    });
  });
});
