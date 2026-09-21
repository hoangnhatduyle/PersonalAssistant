import { describe, expect, it } from "vitest";
import {
  EVENT_BLOCK_MIN_HEIGHT_PX,
  eventHeightPx,
  layoutDayEvents,
  PIXELS_PER_MINUTE,
  pxToMinutes,
  STACK_PEEK_PX,
  weekGridHeightPx,
} from "../layout-day-events";
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

  it("stacks back-to-back events when the short one is drawn taller than its real duration", () => {
    // 4:00–4:30 renders at the 60-minute minimum height, so it visually runs
    // into the 4:30–5:55 block even though the clock times only touch.
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 16 * 60, endMinutes: 16 * 60 + 30 }),
        makeEvent({ id: "next", startMinutes: 16 * 60 + 30, endMinutes: 17 * 60 + 55 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.stackSize === 2)).toBe(true);
    const short = layouted.find((event) => event.id === "short")!;
    const next = layouted.find((event) => event.id === "next")!;
    expect(next.leftPx).toBe(short.leftPx + STACK_PEEK_PX);
  });

  it("does not stack a short event with one that starts after its drawn height ends", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 16 * 60, endMinutes: 16 * 60 + 30 }),
        makeEvent({ id: "later", startMinutes: 17 * 60, endMinutes: 18 * 60 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.stackSize === 1)).toBe(true);
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

describe("pxToMinutes", () => {
  const windowStart = 8 * 60;

  it("converts a pixel offset back into minutes-of-day, snapped to the nearest interval", () => {
    const offsetY = 65 * PIXELS_PER_MINUTE; // 65 minutes past windowStart
    expect(pxToMinutes(offsetY, windowStart)).toBe(windowStart + 60); // snaps down to the nearest 30
  });

  it("snaps up when closer to the next interval", () => {
    const offsetY = 80 * PIXELS_PER_MINUTE; // 80 minutes past windowStart
    expect(pxToMinutes(offsetY, windowStart)).toBe(windowStart + 90);
  });

  it("respects a custom snap interval", () => {
    const offsetY = 22 * PIXELS_PER_MINUTE;
    expect(pxToMinutes(offsetY, windowStart, 15)).toBe(windowStart + 15);
  });

  it("clamps to 0 for an offset above the top of the grid", () => {
    expect(pxToMinutes(-1000, 0)).toBe(0);
  });

  it("clamps to the last valid slot for an offset past midnight", () => {
    expect(pxToMinutes(100000, windowStart)).toBe(24 * 60 - 30);
  });
});
