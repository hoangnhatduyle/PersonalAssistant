import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  calendarDateToDateKey,
  dateKeyToCalendarDate,
  formatDateKeyForDisplay,
  parseDateKey,
  parseTypedDate,
} from "../date-key";

describe("parseDateKey", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(parseDateKey("2026-11-06")).toEqual({ year: 2026, month: 11, day: 6 });
    expect(parseDateKey("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("rejects malformed values and dates that don't exist", () => {
    for (const bad of ["", "2026-1-6", "2026-11-31", "2027-02-29", "2026-13-01", "11/06/2026", "2026-11-06T10:00"]) {
      expect(parseDateKey(bad)).toBeNull();
    }
  });
});

describe("addDaysToDateKey", () => {
  it("rolls across month and year boundaries", () => {
    expect(addDaysToDateKey("2026-11-06", 1)).toBe("2026-11-07");
    expect(addDaysToDateKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2026-11-06", 7)).toBe("2026-11-13");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("calendar date conversion", () => {
  it("round-trips a date key through a local-noon Date without shifting the day", () => {
    const date = dateKeyToCalendarDate("2026-11-06");
    expect(date).toBeDefined();
    expect(date!.getHours()).toBe(12);
    expect(calendarDateToDateKey(date!)).toBe("2026-11-06");
  });

  it("returns undefined for an empty or invalid key", () => {
    expect(dateKeyToCalendarDate("")).toBeUndefined();
    expect(dateKeyToCalendarDate(null)).toBeUndefined();
    expect(dateKeyToCalendarDate("nope")).toBeUndefined();
  });
});

describe("parseTypedDate", () => {
  it("accepts ISO dates, with or without zero padding", () => {
    expect(parseTypedDate("2030-06-01")).toBe("2030-06-01");
    expect(parseTypedDate("2030-6-1")).toBe("2030-06-01");
  });

  it("accepts US-style M/D/YYYY", () => {
    expect(parseTypedDate("6/1/2030")).toBe("2030-06-01");
    expect(parseTypedDate("11/10/2026")).toBe("2026-11-10");
    expect(parseTypedDate(" 11/10/2026 ")).toBe("2026-11-10");
  });

  it("rejects partial, two-digit-year and impossible input", () => {
    for (const bad of ["", "6/1", "6/1/30", "2030-06", "2/30/2026", "13/1/2026", "abc"]) {
      expect(parseTypedDate(bad)).toBeNull();
    }
  });
});

describe("formatDateKeyForDisplay", () => {
  it("formats as M/D/YYYY like the rest of the app's date display", () => {
    expect(formatDateKeyForDisplay("2026-11-06")).toBe("11/6/2026");
    expect(formatDateKeyForDisplay("2026-01-09")).toBe("1/9/2026");
  });

  it("returns an empty string for an empty or invalid key", () => {
    expect(formatDateKeyForDisplay("")).toBe("");
    expect(formatDateKeyForDisplay(null)).toBe("");
    expect(formatDateKeyForDisplay("garbage")).toBe("");
  });
});
