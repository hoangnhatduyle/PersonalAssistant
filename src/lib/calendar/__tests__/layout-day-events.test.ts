import { describe, expect, it } from "vitest";
import { EVENT_BLOCK_HEIGHT_PX, layoutDayEvents, weekGridHeightPx } from "../layout-day-events";
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

  it("gives every block the same fixed height and full column width", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 8 * 60, endMinutes: 8 * 60 + 30 }),
        makeEvent({ id: "long", startMinutes: 9 * 60, endMinutes: 11 * 60 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.heightPx === EVENT_BLOCK_HEIGHT_PX)).toBe(true);
    expect(layouted.every((event) => event.widthPx === contentWidthPx)).toBe(true);
  });

  it("positions blocks by start time on a minute-based axis", () => {
    const layouted = layoutDayEvents([makeEvent({ id: "a", startMinutes: 8 * 60 })], windowStart, columnWidthPx);
    expect(layouted[0].topPx).toBe((8 * 60 - windowStart) * 1.2);
  });

  it("stacks overlapping blocks vertically instead of shrinking their width", () => {
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
    expect(eventA.widthPx).toBe(eventB.widthPx);
    expect(eventB.topPx).toBeGreaterThan(eventA.topPx);
  });
});

describe("weekGridHeightPx", () => {
  it("grows past the time window when stacked events extend below it", () => {
    const days = [
      {
        events: [
          makeEvent({ id: "a", startMinutes: 22 * 60 }),
          makeEvent({ id: "b", startMinutes: 22 * 60 + 15 }),
        ],
      },
    ];

    const height = weekGridHeightPx(7 * 60, 23 * 60, days, 120);
    const stacked = layoutDayEvents(days[0].events, 7 * 60, 120);
    const bottom = Math.max(...stacked.map((event) => event.topPx + event.heightPx));

    expect(height).toBeGreaterThanOrEqual(bottom);
  });
});
