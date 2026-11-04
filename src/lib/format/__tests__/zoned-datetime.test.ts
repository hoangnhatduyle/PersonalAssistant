import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../zoned-datetime";

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
