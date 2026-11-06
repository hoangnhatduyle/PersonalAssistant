import { describe, expect, it } from "vitest";
import { buildTodaysClasses } from "../todays-classes";

// 2026-11-05 is a Thursday.
const TODAY = "2026-11-05";
const course = (fields: Partial<Parameters<typeof buildTodaysClasses>[0][number]> = {}) => ({
  name: "First Solar",
  code: null,
  location: "PGT1",
  meeting_blocks: [{ days: [4], startMinutes: 510, endMinutes: 990 }],
  recurrence_start_date: null,
  recurrence_end_date: null,
  occurrence_overrides: [],
  ...fields,
});

describe("buildTodaysClasses", () => {
  it("lists a class that meets today, with its times and place", () => {
    expect(buildTodaysClasses([course()], TODAY)).toEqual([{ course: "First Solar", location: "PGT1", start: "8:30", end: "16:30" }]);
  });

  it("prefers the course code to its name", () => {
    expect(buildTodaysClasses([course({ code: "PHYS 6280" })], TODAY)[0].course).toBe("PHYS 6280");
  });

  it("omits a class that doesn't meet today, or whose recurrence range excludes today", () => {
    expect(buildTodaysClasses([course({ meeting_blocks: [{ days: [2], startMinutes: 510, endMinutes: 990 }] })], TODAY)).toEqual([]);
    expect(buildTodaysClasses([course({ recurrence_end_date: "2026-10-31" })], TODAY)).toEqual([]);
  });

  it("omits a class cancelled for today", () => {
    const cancelled = course({
      occurrence_overrides: [{ original_date: TODAY, original_start_minutes: 510, is_cancelled: true, new_date: null, new_start_minutes: null, new_end_minutes: null }],
    });
    expect(buildTodaysClasses([cancelled], TODAY)).toEqual([]);
  });

  it("reports a shortened class by its new hours", () => {
    const halfDay = course({
      occurrence_overrides: [{ original_date: TODAY, original_start_minutes: 510, is_cancelled: false, new_date: TODAY, new_start_minutes: 780, new_end_minutes: 990 }],
    });
    expect(buildTodaysClasses([halfDay], TODAY)).toEqual([{ course: "First Solar", location: "PGT1", start: "13:00", end: "16:30" }]);
  });

  it("includes a class moved onto today from another day, and orders classes by start time", () => {
    const movedIn = course({
      name: "Lab",
      location: null,
      meeting_blocks: [{ days: [2], startMinutes: 600, endMinutes: 660 }],
      occurrence_overrides: [{ original_date: "2026-11-03", original_start_minutes: 600, is_cancelled: false, new_date: TODAY, new_start_minutes: 420, new_end_minutes: 480 }],
    });
    expect(buildTodaysClasses([course(), movedIn], TODAY).map((c) => c.course)).toEqual(["Lab", "First Solar"]);
  });
});
