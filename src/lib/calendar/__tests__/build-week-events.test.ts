import { describe, expect, it } from "vitest";
import { buildWeekGridData } from "../build-week-events";
import { makeCourse, makeMeetingBlock, makeDeadline, makeTask, makePerson } from "./fixtures";

// A fixed Wednesday, so the reference week is deterministic across runs.
// REFERENCE week runs Sun 2026-01-04 .. Sat 2026-01-10.
const REFERENCE = new Date("2026-01-07T12:00:00");

describe("buildWeekGridData", () => {
  it("places a course's meeting block on the correct days", () => {
    const data = buildWeekGridData(
      [makeCourse({ id: "c-1", meeting_blocks: [makeMeetingBlock({ days: [1, 3, 5], startMinutes: 600, endMinutes: 650 })] })],
      [],
      [],
      [],
      REFERENCE,
    );
    const withEvents = data.days.filter((day) => day.events.length > 0);
    expect(withEvents.map((day) => day.dayOfWeek).sort()).toEqual([1, 3, 5]);
    expect(withEvents[0].events[0]).toMatchObject({
      id: "course-c-1-0-1",
      title: "Algorithms",
      timeLabel: "10 AM–10:50 AM",
      tone: "accent",
      href: "/courses/c-1",
      personId: null,
      personLabel: "Me",
    });
    expect(withEvents[0].events[0].color).toBeUndefined();
  });

  it("places multiple blocks on the same course independently, disambiguating ids by block index", () => {
    const data = buildWeekGridData(
      [
        makeCourse({
          id: "c-1",
          meeting_blocks: [
            makeMeetingBlock({ days: [1], startMinutes: 600, endMinutes: 650 }),
            makeMeetingBlock({ days: [1], startMinutes: 780, endMinutes: 830 }),
          ],
        }),
      ],
      [],
      [],
      [],
      REFERENCE,
    );
    const monday = data.days.find((day) => day.dayOfWeek === 1)!;
    expect(monday.events.map((event) => event.id).sort()).toEqual(["course-c-1-0-1", "course-c-1-1-1"]);
  });

  it("does not throw and places nothing for a course with no meeting_blocks configured", () => {
    expect(() => buildWeekGridData([makeCourse({ meeting_blocks: [] })], [], [], [], REFERENCE)).not.toThrow();
    const data = buildWeekGridData([makeCourse({ meeting_blocks: [] })], [], [], [], REFERENCE);
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("excludes a block's occurrence in a week entirely before recurrence_start_date", () => {
    const data = buildWeekGridData(
      [
        makeCourse({
          id: "c-1",
          meeting_blocks: [makeMeetingBlock({ days: [1, 3, 5] })],
          recurrence_start_date: "2026-02-01",
        }),
      ],
      [],
      [],
      [],
      REFERENCE,
    );
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("excludes a block's occurrence in a week entirely after recurrence_end_date", () => {
    const data = buildWeekGridData(
      [
        makeCourse({
          id: "c-1",
          meeting_blocks: [makeMeetingBlock({ days: [1, 3, 5] })],
          recurrence_end_date: "2025-12-01",
        }),
      ],
      [],
      [],
      [],
      REFERENCE,
    );
    expect(data.days.every((day) => day.events.length === 0)).toBe(true);
  });

  it("places only the days that fall within a recurrence range starting mid-week", () => {
    // REFERENCE week: Sun 1/4 .. Sat 1/10. Range starts Wed 1/7, so Monday
    // (1/5) is excluded but Wednesday (1/7) and Friday (1/9) are included.
    const data = buildWeekGridData(
      [
        makeCourse({
          id: "c-1",
          meeting_blocks: [makeMeetingBlock({ days: [1, 3, 5] })],
          recurrence_start_date: "2026-01-07",
        }),
      ],
      [],
      [],
      [],
      REFERENCE,
    );
    const withEvents = data.days.filter((day) => day.events.length > 0);
    expect(withEvents.map((day) => day.dayOfWeek).sort()).toEqual([3, 5]);
  });

  it("places an open deadline within the displayed week as a marker on its due day, colored by its status tone", () => {
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
    const data = buildWeekGridData(
      [makeCourse({ meeting_blocks: [makeMeetingBlock({ days: [1], startMinutes: 6 * 60, endMinutes: 6 * 60 + 30 })] })],
      [],
      [],
      [],
      REFERENCE,
    );
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
        makeCourse({
          id: "c-mine",
          meeting_blocks: [makeMeetingBlock({ days: [1], startMinutes: 600, endMinutes: 650 })],
          person_id: null,
        }),
        makeCourse({
          id: "c-chau",
          meeting_blocks: [makeMeetingBlock({ days: [1], startMinutes: 660, endMinutes: 710 })],
          person_id: "p-chau",
        }),
      ],
      [makeDeadline({ id: "d-chau", due_at: "2026-01-05T15:00:00", person_id: "p-chau" })],
      [makeTask({ id: "t-chau", due_at: "2026-01-05T16:00:00", person_id: "p-chau" })],
      [chau],
      REFERENCE,
    );

    const monday = data.days.find((day) => day.dayOfWeek === 1)!;
    const mineEvent = monday.events.find((event) => event.id === "course-c-mine-0-1")!;
    const chauCourse = monday.events.find((event) => event.id === "course-c-chau-0-1")!;
    const chauDeadline = monday.events.find((event) => event.id === "deadline-d-chau")!;
    const chauTask = monday.events.find((event) => event.id === "task-t-chau")!;

    expect(mineEvent).toMatchObject({ personId: null, personLabel: "Me" });
    expect(mineEvent.color).toBeUndefined();

    for (const event of [chauCourse, chauDeadline, chauTask]) {
      expect(event).toMatchObject({ personId: "p-chau", personLabel: "Chau", color: "#ec4899" });
    }
  });

  it("falls back to an 'Unknown' label when an event's person_id has no matching People row", () => {
    const data = buildWeekGridData(
      [makeCourse({ id: "c-1", meeting_blocks: [makeMeetingBlock({ days: [1], startMinutes: 600, endMinutes: 650 })], person_id: "missing" })],
      [],
      [],
      [],
      REFERENCE,
    );
    const monday = data.days.find((day) => day.dayOfWeek === 1)!;
    expect(monday.events[0]).toMatchObject({ personId: "missing", personLabel: "Unknown" });
  });
});
