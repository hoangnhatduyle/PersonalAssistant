import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, isoToZonedParts, todayInZone, zonedPartsToIso } from "../zoned-datetime";

// 11:59 PM on Nov 10 in Detroit (EST, UTC-5): what "due Nov 10, end of day" is stored as.
const NOV_10_END_OF_DAY = "2026-11-11T04:59:00Z";

describe("formatDateTime", () => {
  it("shows a deadline stored at 04:59 UTC as 11:59 PM the day before in Detroit", () => {
    expect(formatDateTime(NOV_10_END_OF_DAY, "America/Detroit")).toBe("11/10/2026, 11:59 PM");
  });

  it("shows the same instant as 4:59 AM when the zone is UTC", () => {
    expect(formatDateTime(NOV_10_END_OF_DAY, "UTC")).toBe("11/11/2026, 4:59 AM");
  });

  it("keeps end-of-day at 11:59 PM across the Nov 1 daylight-saving change", () => {
    // 03:59 UTC is 11:59 PM EDT (UTC-4) before the change; 04:59 UTC is 11:59 PM EST (UTC-5) after it.
    expect(formatDateTime("2026-10-28T03:59:00Z", "America/Detroit")).toBe("10/27/2026, 11:59 PM");
    expect(formatDateTime("2026-11-04T04:59:00Z", "America/Detroit")).toBe("11/3/2026, 11:59 PM");
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(formatDateTime(new Date(NOV_10_END_OF_DAY), "America/Detroit")).toBe("11/10/2026, 11:59 PM");
  });

  it("uses a plain space before AM/PM, not the narrow no-break space newer ICU data emits", () => {
    expect(formatDateTime(NOV_10_END_OF_DAY, "America/Detroit")).not.toContain(" ");
  });

  it("falls back to the device zone instead of throwing on an unrecognized zone", () => {
    expect(() => formatDateTime(NOV_10_END_OF_DAY, "Not/AZone")).not.toThrow();
    expect(formatDateTime(NOV_10_END_OF_DAY, "Not/AZone")).toMatch(/2026/);
  });

  it("returns an empty string for an invalid date instead of throwing", () => {
    expect(formatDateTime("not a date", "America/Detroit")).toBe("");
  });
});

describe("formatDate", () => {
  it("shows the calendar day in the given zone, so a late-evening deadline does not slip to tomorrow", () => {
    expect(formatDate(NOV_10_END_OF_DAY, "America/Detroit")).toBe("11/10/2026");
    expect(formatDate(NOV_10_END_OF_DAY, "UTC")).toBe("11/11/2026");
  });

  it("honours custom options, such as the short month-and-day the board card uses", () => {
    expect(formatDate(NOV_10_END_OF_DAY, "America/Detroit", { month: "short", day: "numeric" })).toBe("Nov 10");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDate("", "America/Detroit")).toBe("");
  });
});

describe("isoToZonedParts", () => {
  it("splits an instant into the wall-clock date and time of the given zone", () => {
    expect(isoToZonedParts(NOV_10_END_OF_DAY, "America/Detroit")).toEqual({ date: "2026-11-10", time: "23:59" });
    expect(isoToZonedParts(NOV_10_END_OF_DAY, "UTC")).toEqual({ date: "2026-11-11", time: "04:59" });
  });

  it("returns null for an empty or invalid value", () => {
    expect(isoToZonedParts(null, "UTC")).toBeNull();
    expect(isoToZonedParts("", "UTC")).toBeNull();
    expect(isoToZonedParts("not-a-date", "UTC")).toBeNull();
  });

  it("falls back to the device zone on an unrecognized zone instead of throwing", () => {
    expect(isoToZonedParts(NOV_10_END_OF_DAY, "Not/AZone")).not.toBeNull();
  });
});

describe("zonedPartsToIso", () => {
  it("turns a wall-clock date and time in a zone into the matching UTC instant", () => {
    expect(zonedPartsToIso("2026-11-10", "23:59", "America/Detroit")).toBe("2026-11-11T04:59:00.000Z");
    expect(zonedPartsToIso("2026-11-10", "23:59", "UTC")).toBe("2026-11-10T23:59:00.000Z");
  });

  it("uses the offset in force on that date across the Nov 1 daylight-saving change", () => {
    expect(zonedPartsToIso("2026-10-27", "23:59", "America/Detroit")).toBe("2026-10-28T03:59:00.000Z"); // EDT, UTC-4
    expect(zonedPartsToIso("2026-11-03", "23:59", "America/Detroit")).toBe("2026-11-04T04:59:00.000Z"); // EST, UTC-5
  });

  it("round-trips with isoToZonedParts, including a zone east of UTC", () => {
    const iso = zonedPartsToIso("2026-11-06", "08:30", "Asia/Ho_Chi_Minh");
    expect(iso).toBe("2026-11-06T01:30:00.000Z");
    expect(isoToZonedParts(iso, "Asia/Ho_Chi_Minh")).toEqual({ date: "2026-11-06", time: "08:30" });
  });

  it("lands just after the gap for a wall-clock time that does not exist (spring forward)", () => {
    // 2026-03-08 02:30 does not exist in Detroit (clocks jump 02:00 -> 03:00 EDT).
    const iso = zonedPartsToIso("2026-03-08", "02:30", "America/Detroit");
    expect(isoToZonedParts(iso, "America/Detroit")).toEqual({ date: "2026-03-08", time: "03:30" });
  });

  it("lands just after the gap for a non-existent time in a zone east of UTC too (Berlin, 29 Mar 2026)", () => {
    // 02:30 doesn't exist in Berlin (clocks jump 02:00 CET -> 03:00 CEST); it resolves to 03:30 CEST = 01:30Z.
    const iso = zonedPartsToIso("2026-03-29", "02:30", "Europe/Berlin");
    expect(iso).toBe("2026-03-29T01:30:00.000Z");
    expect(isoToZonedParts(iso, "Europe/Berlin")).toEqual({ date: "2026-03-29", time: "03:30" });
  });

  it("resolves an ambiguous fall-back time to the earlier instant, on both sides of UTC", () => {
    // New York 2026-11-01 01:30 happens twice (EDT then EST): the earlier is 05:30Z.
    expect(zonedPartsToIso("2026-11-01", "01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
    // Berlin 2026-10-25 02:30 happens twice (CEST then CET): the earlier is 00:30Z.
    expect(zonedPartsToIso("2026-10-25", "02:30", "Europe/Berlin")).toBe("2026-10-25T00:30:00.000Z");
  });

  it("gives ordinary times on the transition day itself the right offset", () => {
    expect(zonedPartsToIso("2026-03-29", "12:00", "Europe/Berlin")).toBe("2026-03-29T10:00:00.000Z"); // CEST
    expect(zonedPartsToIso("2026-03-29", "01:00", "Europe/Berlin")).toBe("2026-03-29T00:00:00.000Z"); // still CET
    expect(zonedPartsToIso("2026-11-01", "12:00", "America/New_York")).toBe("2026-11-01T17:00:00.000Z"); // EST
  });

  it("returns null for a malformed date or time", () => {
    expect(zonedPartsToIso("", "10:00", "UTC")).toBeNull();
    expect(zonedPartsToIso("2026-11-06", "", "UTC")).toBeNull();
    expect(zonedPartsToIso("2026-13-40", "10:00", "UTC")).toBeNull();
    expect(zonedPartsToIso("2026-11-06", "25:00", "UTC")).toBeNull();
  });
});

describe("todayInZone", () => {
  it("returns the calendar date in the zone, not the device or UTC date", () => {
    const now = new Date("2026-11-06T03:30:00Z"); // still Nov 5 in Detroit, already Nov 6 in UTC
    expect(todayInZone("America/Detroit", now)).toBe("2026-11-05");
    expect(todayInZone("UTC", now)).toBe("2026-11-06");
    expect(todayInZone("Asia/Ho_Chi_Minh", now)).toBe("2026-11-06");
  });
});
