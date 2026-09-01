import { describe, expect, it } from "vitest";
import { EVENT_BLOCK_MIN_HEIGHT_PX, eventHeightPx, layoutDayEvents, PIXELS_PER_MINUTE, STACK_PEEK_PX, weekGridHeightPx } from "../layout-day-events";
import type { CalendarEvent } from "../build-week-events";

function makeEvent(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "startMinutes">): CalendarEvent {
  return {
    title: overrides.title ?? "Event",
    timeLabel: overrides.timeLabel ?? "10 AM–11 AM",
    subtitle: overrides.subtitle ?? "Room 101",
    endMinutes: overrides.endMinutes ?? overrides.startMinutes + 50,
    tone: overrides.tone ?? "accent",
    href: overrides.href ?? "/courses/c-1",
    personId: overrides.personId ?? null,
    personLabel: overrides.personLabel ?? "Me",
    ...overrides,
  };
}

describe("eventHeightPx", () => {
  it("enforces a minimum height for short events", () => {
    expect(eventHeightPx(10 * 60, 10 * 60 + 20)).toBe(EVENT_BLOCK_MIN_HEIGHT_PX);
  });

  it("scales height with real duration for long events", () => {
    expect(eventHeightPx(13 * 60, 17 * 60 + 55)).toBe((17 * 60 + 55 - 13 * 60) * PIXELS_PER_MINUTE);
  });
});

describe("layoutDayEvents", () => {
  const windowStart = 7 * 60;
  const columnWidthPx = 120;
  const contentWidthPx = columnWidthPx - 8;

  it("positions blocks by start time on a minute-based axis", () => {
    const layouted = layoutDayEvents([makeEvent({ id: "a", startMinutes: 8 * 60 })], windowStart, columnWidthPx);
    expect(layouted[0].topPx).toBe((8 * 60 - windowStart) * PIXELS_PER_MINUTE);
  });

  it("clusters events that overlap in real clock time even when one starts before the other ends", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "lecture", startMinutes: 8 * 60, endMinutes: 8 * 60 + 80 }),
        makeEvent({ id: "structure", startMinutes: 9 * 60, endMinutes: 9 * 60 + 110 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.stackSize === 2)).toBe(true);
    expect(layouted.find((event) => event.id === "structure")!.topPx).toBe((9 * 60 - windowStart) * PIXELS_PER_MINUTE);
  });

  it("keeps staggered start times and peeks buried cards horizontally", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "a", startMinutes: 10 * 60, endMinutes: 11 * 60 }),
        makeEvent({ id: "b", startMinutes: 10 * 60 + 15, endMinutes: 11 * 60 + 15 }),
      ],
      windowStart,
      columnWidthPx,
    );

    const eventA = layouted.find((event) => event.id === "a")!;
    const eventB = layouted.find((event) => event.id === "b")!;
    expect(eventA.topPx).toBeLessThan(eventB.topPx);
    expect(eventB.leftPx).toBe(eventA.leftPx + STACK_PEEK_PX);
    expect(eventB.widthPx).toBe(contentWidthPx - STACK_PEEK_PX);
  });

  it("does not offset non-overlapping blocks", () => {
    const layouted = layoutDayEvents(
      [makeEvent({ id: "a", startMinutes: 10 * 60 }), makeEvent({ id: "b", startMinutes: 12 * 60 })],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.stackSize === 1)).toBe(true);
    expect(layouted.every((event) => event.leftPx === 4)).toBe(true);
    expect(layouted.every((event) => event.widthPx === contentWidthPx)).toBe(true);
  });
});

describe("weekGridHeightPx", () => {
  it("matches the visible time window plus one card of padding", () => {
    expect(weekGridHeightPx(8 * 60, 18 * 60)).toBe((18 * 60 - 8 * 60) * PIXELS_PER_MINUTE + EVENT_BLOCK_MIN_HEIGHT_PX);
  });
});
