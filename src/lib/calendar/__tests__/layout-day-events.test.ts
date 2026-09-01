import { describe, expect, it } from "vitest";
import { EVENT_BLOCK_HEIGHT_PX, layoutDayEvents, STACK_PEEK_PX, weekGridHeightPx } from "../layout-day-events";
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

describe("layoutDayEvents", () => {
  const windowStart = 7 * 60;
  const columnWidthPx = 120;
  const contentWidthPx = columnWidthPx - 8;

  it("gives every block the same fixed height", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 8 * 60, endMinutes: 8 * 60 + 30 }),
        makeEvent({ id: "long", startMinutes: 9 * 60, endMinutes: 11 * 60 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.heightPx === EVENT_BLOCK_HEIGHT_PX)).toBe(true);
  });

  it("positions blocks by start time on a minute-based axis", () => {
    const layouted = layoutDayEvents([makeEvent({ id: "a", startMinutes: 8 * 60 })], windowStart, columnWidthPx);
    expect(layouted[0].topPx).toBe((8 * 60 - windowStart) * 1.2);
  });

  it("keeps overlapping blocks at their real start times and peeks buried cards horizontally", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "a", startMinutes: 10 * 60 }),
        makeEvent({ id: "b", startMinutes: 10 * 60 + 15 }),
      ],
      windowStart,
      columnWidthPx,
    );

    const eventA = layouted.find((event) => event.id === "a")!;
    const eventB = layouted.find((event) => event.id === "b")!;
    expect(eventA.topPx).toBeLessThan(eventB.topPx);
    expect(eventA.stackSize).toBe(2);
    expect(eventB.stackIndex).toBeGreaterThan(eventA.stackIndex);
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
    expect(weekGridHeightPx(8 * 60, 18 * 60)).toBe((18 * 60 - 8 * 60) * 1.2 + EVENT_BLOCK_HEIGHT_PX);
  });
});
