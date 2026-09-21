import { describe, expect, it } from "vitest";
import {
  COMPACT_EVENT_MIN_HEIGHT_PX,
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

  it("keeps back-to-back events side by side in time by trimming the short one instead of overlapping", () => {
    // 4:00–4:30 would render at the 72px minimum and run into 4:30–5:55.
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 16 * 60, endMinutes: 16 * 60 + 30 }),
        makeEvent({ id: "next", startMinutes: 16 * 60 + 30, endMinutes: 17 * 60 + 55 }),
      ],
      windowStart,
      columnWidthPx,
    );

    const short = layouted.find((event) => event.id === "short")!;
    const next = layouted.find((event) => event.id === "next")!;
    expect(layouted.every((event) => event.stackSize === 1 && event.leftPx === 4)).toBe(true);
    expect(short.topPx + short.heightPx).toBeLessThanOrEqual(next.topPx);
    expect(short.heightPx).toBeGreaterThanOrEqual(COMPACT_EVENT_MIN_HEIGHT_PX);
  });

  it("keeps the full minimum height when nothing follows closely", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 16 * 60, endMinutes: 16 * 60 + 30 }),
        makeEvent({ id: "later", startMinutes: 17 * 60 + 30, endMinutes: 18 * 60 + 30 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.find((event) => event.id === "short")!.heightPx).toBe(EVENT_BLOCK_MIN_HEIGHT_PX);
    expect(layouted.every((event) => event.stackSize === 1)).toBe(true);
  });

  it("trims stacked cards too so no card reaches into the event that follows the stack", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "a", startMinutes: 10 * 60, endMinutes: 10 * 60 + 40 }),
        makeEvent({ id: "b", startMinutes: 10 * 60 + 10, endMinutes: 10 * 60 + 40 }),
        makeEvent({ id: "after", startMinutes: 10 * 60 + 45, endMinutes: 11 * 60 + 30 }),
      ],
      windowStart,
      columnWidthPx,
    );

    const after = layouted.find((event) => event.id === "after")!;
    for (const event of layouted.filter((item) => item.id !== "after")) {
      expect(event.topPx + event.heightPx).toBeLessThanOrEqual(after.topPx);
    }
  });

  it("stacks events whose gap is too small to draw both without overlap", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "a", startMinutes: 10 * 60, endMinutes: 10 * 60 + 10 }),
        makeEvent({ id: "b", startMinutes: 10 * 60 + 10, endMinutes: 11 * 60 }),
      ],
      windowStart,
      columnWidthPx,
    );

    expect(layouted.every((event) => event.stackSize === 2)).toBe(true);
  });

  it("reports the uncovered height of a stacked card as the distance to the card layered on top of it", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "a", startMinutes: 10 * 60, endMinutes: 11 * 60 }),
        makeEvent({ id: "b", startMinutes: 10 * 60 + 10, endMinutes: 11 * 60 }),
      ],
      windowStart,
      columnWidthPx,
    );

    const eventA = layouted.find((event) => event.id === "a")!;
    const eventB = layouted.find((event) => event.id === "b")!;
    expect(eventA.visibleHeightPx).toBe(10 * PIXELS_PER_MINUTE);
    expect(eventB.visibleHeightPx).toBe(eventB.heightPx);
  });

  it("reports the trimmed height as visible for a card that nothing is layered on", () => {
    const layouted = layoutDayEvents(
      [
        makeEvent({ id: "short", startMinutes: 16 * 60, endMinutes: 16 * 60 + 30 }),
        makeEvent({ id: "next", startMinutes: 16 * 60 + 30, endMinutes: 17 * 60 + 55 }),
      ],
      windowStart,
      columnWidthPx,
    );

    for (const event of layouted) expect(event.visibleHeightPx).toBe(event.heightPx);
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
