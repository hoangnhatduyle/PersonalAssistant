import { describe, expect, it } from "vitest";
import { buildWeekGridData } from "../build-week-events";
import { makeCourse, makeDeadline, makeTask, makePerson } from "./fixtures";

// A fixed Wednesday, so the reference week is deterministic across runs.
const REFERENCE = new Date("2026-01-07T12:00:00");

describe("buildWeekGridData", () => {
  it("places a parsed course's blocks on the correct days", () => {
    const data = buildWeekGridData([makeCourse({ id: "c-1", meeting_pattern: "MWF 10:00-10:50" })], [], [], [], REFERENCE);
    const withEvents = data.days.filter((day) => day.events.length > 0);
    expect(withEvents.map((day) => day.dayOfWeek).sort()).toEqual([1, 3, 5]);
    expect(withEvents[0].events[0]).toMatchObject({
      title: "Algorithms",
      tone: "accent",
      href: "/courses/c-1",
      personId: null,
      personLabel: "Me",
    });
    expect(withEvents[0].events[0].color).toBeUndefined();
  });

  it("routes an unparseable meeting_pattern to unparsedCourses instead of the grid", () => {
    const data = buildWeekGridData([makeCourse({ id: "c-1", meeting_pattern: "whenever works" })], [], [], [], REFERENCE);
    expect(data.unparsedCourses).toHaveLength(1);
    expect(data.unparsedCourses[0].id).toBe("c-1");
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("does not throw for a garbage meeting_pattern", () => {
    expect(() => buildWeekGridData([makeCourse({ meeting_pattern: "###" })], [], [], [], REFERENCE)).not.toThrow();
  });

  it("skips courses with no meeting_pattern at all", () => {
    const data = buildWeekGridData([makeCourse({ meeting_pattern: null })], [], [], [], REFERENCE);
    expect(data.unparsedCourses).toHaveLength(0);
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("places an open deadline within the displayed week as a marker on its due day, colored by its status tone", () => {
    // REFERENCE week runs Sun 2026-01-04 .. Sat 2026-01-10; Thursday is the 8th.
    const data = buildWeekGridData([], [makeDeadline({ id: "d-1", status: "Overdue", due_at: "2026-01-08T15:00:00" })], [], [], REFERENCE);
    const thursday = data.days.find((day) => day.dayOfWeek === 4)!;
    expect(thursday.events).toHaveLength(1);
    expect(thursday.events[0]).toMatchObject({ title: "Deadline", tone: "urgent", href: "/deadlines/d-1", personLabel: "Me" });
  });

  it("excludes a deadline outside the displayed week", () => {
    const data = buildWeekGridData([], [makeDeadline({ id: "d-1", status: "Not Started", due_at: "2026-02-01T15:00:00" })], [], [], REFERENCE);
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("excludes Completed and Cancelled deadlines even within the week", () => {
    const data = buildWeekGridData(
      [],
      [
        makeDeadline({ id: "d-1", status: "Completed", due_at: "2026-01-08T15:00:00" }),
        makeDeadline({ id: "d-2", status: "Cancelled", due_at: "2026-01-08T15:00:00" }),
      ],
      [],
      [],
      REFERENCE,
    );
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("widens the display window to cover an early or late course", () => {
    const data = buildWeekGridData([makeCourse({ meeting_pattern: "M 6:00-6:30" })], [], [], [], REFERENCE);
    expect(data.windowStart).toBeLessThanOrEqual(6 * 60);
  });

  it("marks the reference date's own day column as today", () => {
    const data = buildWeekGridData([], [], [], [], REFERENCE);
    const wednesday = data.days.find((day) => day.dayOfWeek === REFERENCE.getDay())!;
    expect(wednesday.isToday).toBe(true);
    expect(data.days.filter((day) => day.isToday)).toHaveLength(1);
  });

  it("places an open task with a due_at within the displayed week as a marker on its due day", () => {
    const data = buildWeekGridData([], [], [makeTask({ id: "t-1", status: "Open", due_at: "2026-01-08T15:00:00" })], [], REFERENCE);
    const thursday = data.days.find((day) => day.dayOfWeek === 4)!;
    expect(thursday.events).toHaveLength(1);
    expect(thursday.events[0]).toMatchObject({ title: "Task", subtitle: "Task", tone: "accent", href: "/tasks/t-1" });
  });

  it("excludes a Done task and a task with no due_at", () => {
    const data = buildWeekGridData(
      [],
      [],
      [makeTask({ id: "t-1", status: "Done", due_at: "2026-01-08T15:00:00" }), makeTask({ id: "t-2", status: "Open", due_at: null })],
      [],
      REFERENCE,
    );
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("labels and colors a tracked Person's course/deadline/task from the people list, leaving the owner's own events uncolored", () => {
    const chau = makePerson({ id: "p-chau", name: "Chau", color: "#ec4899" });
    const data = buildWeekGridData(
      [
        makeCourse({ id: "c-mine", meeting_pattern: "M 10:00-10:50", person_id: null }),
        makeCourse({ id: "c-chau", meeting_pattern: "M 11:00-11:50", person_id: "p-chau" }),
      ],
      [makeDeadline({ id: "d-chau", due_at: "2026-01-05T15:00:00", person_id: "p-chau" })],
      [makeTask({ id: "t-chau", due_at: "2026-01-05T16:00:00", person_id: "p-chau" })],
      [chau],
      REFERENCE,
    );

    const monday = data.days.find((day) => day.dayOfWeek === 1)!;
    const mineEvent = monday.events.find((event) => event.id === "course-c-mine-1")!;
    const chauCourse = monday.events.find((event) => event.id === "course-c-chau-1")!;
    const chauDeadline = monday.events.find((event) => event.id === "deadline-d-chau")!;
    const chauTask = monday.events.find((event) => event.id === "task-t-chau")!;

    expect(mineEvent).toMatchObject({ personId: null, personLabel: "Me" });
    expect(mineEvent.color).toBeUndefined();

    for (const event of [chauCourse, chauDeadline, chauTask]) {
      expect(event).toMatchObject({ personId: "p-chau", personLabel: "Chau", color: "#ec4899" });
    }
  });

  it("falls back to an 'Unknown' label when an event's person_id has no matching People row", () => {
    const data = buildWeekGridData([makeCourse({ id: "c-1", meeting_pattern: "M 10:00-10:50", person_id: "missing" })], [], [], [], REFERENCE);
    const monday = data.days.find((day) => day.dayOfWeek === 1)!;
    expect(monday.events[0]).toMatchObject({ personId: "missing", personLabel: "Unknown" });
  });
});
