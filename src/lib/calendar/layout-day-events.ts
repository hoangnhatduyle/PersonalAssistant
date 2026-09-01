import type { CalendarEvent } from "@/lib/calendar/build-week-events";

export const EVENT_BLOCK_HEIGHT_PX = 72;
export const PIXELS_PER_MINUTE = 1.2;
const HORIZONTAL_INSET_PX = 4;
const VERTICAL_GAP_PX = 4;

export interface LayoutedCalendarEvent extends CalendarEvent {
  topPx: number;
  heightPx: number;
  leftPx: number;
  widthPx: number;
}

function timeTopPx(startMinutes: number, windowStart: number): number {
  return (startMinutes - windowStart) * PIXELS_PER_MINUTE;
}

function overlapsVertically(aTop: number, aHeight: number, bTop: number, bHeight: number): boolean {
  return aTop < bTop + bHeight + VERTICAL_GAP_PX && aTop + aHeight + VERTICAL_GAP_PX > bTop;
}

/** Positions same-size, full-width event cards and stacks them when their time ranges collide. */
export function layoutDayEvents(events: CalendarEvent[], windowStart: number, columnWidthPx: number): LayoutedCalendarEvent[] {
  if (events.length === 0) return [];

  const contentWidthPx = Math.max(columnWidthPx - HORIZONTAL_INSET_PX * 2, 0);
  const sorted = [...events].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.endMinutes - b.endMinutes;
  });

  const placed: LayoutedCalendarEvent[] = [];

  for (const event of sorted) {
    let topPx = timeTopPx(event.startMinutes, windowStart);

    for (const existing of placed) {
      if (overlapsVertically(topPx, EVENT_BLOCK_HEIGHT_PX, existing.topPx, existing.heightPx)) {
        topPx = Math.max(topPx, existing.topPx + existing.heightPx + VERTICAL_GAP_PX);
      }
    }

    placed.push({
      ...event,
      topPx,
      heightPx: EVENT_BLOCK_HEIGHT_PX,
      leftPx: HORIZONTAL_INSET_PX,
      widthPx: contentWidthPx,
    });
  }

  return placed;
}

export function weekGridHeightPx(windowStart: number, windowEnd: number, days: Array<{ events: CalendarEvent[] }>, columnWidthPx: number): number {
  const timeAxisHeightPx = (windowEnd - windowStart) * PIXELS_PER_MINUTE + EVENT_BLOCK_HEIGHT_PX;
  let maxBottomPx = 0;

  for (const day of days) {
    for (const event of layoutDayEvents(day.events, windowStart, columnWidthPx)) {
      maxBottomPx = Math.max(maxBottomPx, event.topPx + event.heightPx);
    }
  }

  return Math.max(timeAxisHeightPx, maxBottomPx + VERTICAL_GAP_PX);
}
