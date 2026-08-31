import { describe, expect, it } from "vitest";
import { buildWeekGridData } from "../build-week-events";
import { makeCourse, makeDeadline } from "./fixtures";

// A fixed Wednesday, so the reference week is deterministic across runs.
const REFERENCE = new Date("2026-01-07T12:00:00");

describe("buildWeekGridData", () => {
  it("places a parsed course's blocks on the correct days", () => {
    const data = buildWeekGridData([makeCourse({ id: "c-1", meeting_pattern: "MWF 10:00-10:50" })], [], REFERENCE);
    const withEvents = data.days.filter((day) => day.events.length > 0);
    expect(withEvents.map((day) => day.dayOfWeek).sort()).toEqual([1, 3, 5]);
    expect(withEvents[0].events[0]).toMatchObject({ title: "Algorithms", tone: "accent", href: "/courses/c-1" });
  });

  it("routes an unparseable meeting_pattern to unparsedCourses instead of the grid", () => {
    const data = buildWeekGridData([makeCourse({ id: "c-1", meeting_pattern: "whenever works" })], [], REFERENCE);
    expect(data.unparsedCourses).toHaveLength(1);
    expect(data.unparsedCourses[0].id).toBe("c-1");
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("does not throw for a garbage meeting_pattern", () => {
    expect(() => buildWeekGridData([makeCourse({ meeting_pattern: "###" })], [], REFERENCE)).not.toThrow();
  });

  it("skips courses with no meeting_pattern at all", () => {
    const data = buildWeekGridData([makeCourse({ meeting_pattern: null })], [], REFERENCE);
    expect(data.unparsedCourses).toHaveLength(0);
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("places an open deadline within the displayed week as a marker on its due day, colored by its status tone", () => {
    // REFERENCE week runs Sun 2026-01-04 .. Sat 2026-01-10; Thursday is the 8th.
    const data = buildWeekGridData([], [makeDeadline({ id: "d-1", status: "Overdue", due_at: "2026-01-08T15:00:00" })], REFERENCE);
    const thursday = data.days.find((day) => day.dayOfWeek === 4)!;
    expect(thursday.events).toHaveLength(1);
    expect(thursday.events[0]).toMatchObject({ title: "Deadline", tone: "urgent", href: "/deadlines/d-1" });
  });

  it("excludes a deadline outside the displayed week", () => {
    const data = buildWeekGridData([], [makeDeadline({ id: "d-1", status: "Not Started", due_at: "2026-02-01T15:00:00" })], REFERENCE);
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("excludes Completed and Cancelled deadlines even within the week", () => {
    const data = buildWeekGridData(
      [],
      [
        makeDeadline({ id: "d-1", status: "Completed", due_at: "2026-01-08T15:00:00" }),
        makeDeadline({ id: "d-2", status: "Cancelled", due_at: "2026-01-08T15:00:00" }),
      ],
      REFERENCE,
    );
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("widens the display window to cover an early or late course", () => {
    const data = buildWeekGridData([makeCourse({ meeting_pattern: "M 6:00-6:30" })], [], REFERENCE);
    expect(data.windowStart).toBeLessThanOrEqual(6 * 60);
  });

  it("marks the reference date's own day column as today", () => {
    const data = buildWeekGridData([], [], REFERENCE);
    const wednesday = data.days.find((day) => day.dayOfWeek === REFERENCE.getDay())!;
    expect(wednesday.isToday).toBe(true);
    expect(data.days.filter((day) => day.isToday)).toHaveLength(1);
  });
});
