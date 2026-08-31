import { describe, expect, it } from "vitest";
import { formatMinutesOfDay, parseMeetingPattern } from "../parse-meeting-pattern";

describe("parseMeetingPattern", () => {
  it("parses the canonical MWF form", () => {
    expect(parseMeetingPattern("MWF 10:00-10:50")).toEqual({
      days: [1, 3, 5],
      startMinutes: 600,
      endMinutes: 650,
    });
  });

  it("parses TR with R meaning Thursday", () => {
    expect(parseMeetingPattern("TR 14:00-15:15")).toEqual({
      days: [2, 4],
      startMinutes: 840,
      endMinutes: 915,
    });
  });

  it("parses the colloquial TTh form identically to TR", () => {
    expect(parseMeetingPattern("TTh 14:00-15:15")).toEqual(parseMeetingPattern("TR 14:00-15:15"));
  });

  it("parses slash-separated day names", () => {
    expect(parseMeetingPattern("Mon/Wed/Fri 9:00am-9:50am")).toEqual({
      days: [1, 3, 5],
      startMinutes: 540,
      endMinutes: 590,
    });
  });

  it("parses comma-separated day names", () => {
    expect(parseMeetingPattern("Tue, Thu 2:00pm-3:15pm")).toEqual({
      days: [2, 4],
      startMinutes: 840,
      endMinutes: 915,
    });
  });

  it("infers am/pm on the start time from the end time only", () => {
    expect(parseMeetingPattern("MWF 9-9:50am")).toEqual({
      days: [1, 3, 5],
      startMinutes: 540,
      endMinutes: 590,
    });
  });

  it("treats a bare 24-hour range with no meridiem literally", () => {
    expect(parseMeetingPattern("MWF 10:00-10:50")?.startMinutes).toBe(10 * 60);
  });

  it("is case-insensitive", () => {
    expect(parseMeetingPattern("mwf 10:00-10:50")).toEqual(parseMeetingPattern("MWF 10:00-10:50"));
  });

  it("returns null for an empty string", () => {
    expect(parseMeetingPattern("")).toBeNull();
  });

  it("returns null for garbage without throwing", () => {
    expect(() => parseMeetingPattern("Somewhere in the building, sometimes")).not.toThrow();
    expect(parseMeetingPattern("Somewhere in the building, sometimes")).toBeNull();
  });

  it("returns null for an unrecognized day token", () => {
    expect(parseMeetingPattern("XYZ 10:00-10:50")).toBeNull();
  });

  it("returns null when the end time is before the start time", () => {
    expect(parseMeetingPattern("MWF 10:50-10:00")).toBeNull();
  });

  it("returns null for an out-of-range hour", () => {
    expect(parseMeetingPattern("MWF 25:00-26:00")).toBeNull();
  });

  it("returns null when there's no dash-separated time range at all", () => {
    expect(parseMeetingPattern("MWF sometime in the morning")).toBeNull();
  });
});

describe("formatMinutesOfDay", () => {
  it("formats on-the-hour times without minutes", () => {
    expect(formatMinutesOfDay(10 * 60)).toBe("10 AM");
  });

  it("formats times with minutes", () => {
    expect(formatMinutesOfDay(14 * 60 + 15)).toBe("2:15 PM");
  });

  it("formats midnight and noon correctly", () => {
    expect(formatMinutesOfDay(0)).toBe("12 AM");
    expect(formatMinutesOfDay(12 * 60)).toBe("12 PM");
  });
});
