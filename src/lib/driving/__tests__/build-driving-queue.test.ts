import { describe, expect, it } from "vitest";
import { buildDrivingQueue } from "../build-driving-queue";
import { makeAppointment, makeDeadline, makePerson, makeTask } from "@/lib/dashboard/__tests__/fixtures";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Lecture",
    timeLabel: "10:00–10:50 AM",
    subtitle: "Room 101",
    startMinutes: 600,
    endMinutes: 650,
    tone: "neutral",
    href: "/calendar",
    personId: null,
    personLabel: "Me",
    ...overrides,
  };
}

const REFERENCE_DATE = new Date("2026-01-04T08:00:00");

describe("buildDrivingQueue", () => {
  it("interleaves today's calendar events with deadlines/tasks by time", () => {
    const queue = buildDrivingQueue({
      deadlines: [makeDeadline({ id: "d-1", due_at: "2026-01-04T18:00:00" })],
      tasks: [makeTask({ id: "t-1", due_at: "2026-01-04T09:00:00" })],
      todayCalendarEvents: [makeCalendarEvent({ id: "evt-1", startMinutes: 10 * 60 })],
      referenceDate: REFERENCE_DATE,
    });

    expect(queue.map((item) => item.id)).toEqual(["t-1", "evt-1", "d-1"]);
    expect(queue.find((item) => item.id === "evt-1")?.kind).toBe("event");
  });

  it("excludes calendar events outside today's window from the merge input", () => {
    const queue = buildDrivingQueue({
      deadlines: [],
      tasks: [],
      referenceDate: REFERENCE_DATE,
    });

    expect(queue).toHaveLength(0);
  });

  it("computes an event's absolute time from referenceDate's calendar day, not the event id/order", () => {
    const queue = buildDrivingQueue({
      deadlines: [],
      tasks: [],
      todayCalendarEvents: [makeCalendarEvent({ id: "evt-late", startMinutes: 23 * 60 })],
      referenceDate: REFERENCE_DATE,
    });

    expect(queue[0].at.getFullYear()).toBe(2026);
    expect(queue[0].at.getMonth()).toBe(0);
    expect(queue[0].at.getDate()).toBe(4);
    expect(queue[0].at.getHours()).toBe(23);
  });

  it("includes today's general Appointments as kind 'appointment', carrying the conflict flag through from buildUpcomingItems", () => {
    const queue = buildDrivingQueue({
      deadlines: [],
      tasks: [],
      appointments: [
        makeAppointment({ id: "a-1", category: "Career", session_status: null, event_status: "planned", deadline_id: null, date: "2026-01-04", time: "14:00", duration_minutes: 60 }),
        makeAppointment({ id: "a-2", category: "Academic", session_status: null, event_status: "planned", deadline_id: null, date: "2026-01-04", time: "14:30", duration_minutes: 30 }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(queue.map((item) => item.kind)).toEqual(["appointment", "appointment"]);
    expect(queue.every((item) => item.conflict)).toBe(true);
  });

  it("forwards `people` through to label a tracked Person's Task", () => {
    const chau = makePerson({ id: "p-chau", name: "Chau" });
    const queue = buildDrivingQueue({
      deadlines: [],
      tasks: [makeTask({ id: "t-chau", due_at: "2026-01-04T09:00:00", person_id: "p-chau" })],
      people: [chau],
      referenceDate: REFERENCE_DATE,
    });

    expect(queue[0]).toMatchObject({ id: "t-chau", personId: "p-chau", personLabel: "Chau" });
  });
});
