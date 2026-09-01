import type { CalendarEvent } from "@/lib/calendar/build-week-events";

/** Minimum height so name, time, and location always fit on short events. */
export const EVENT_BLOCK_MIN_HEIGHT_PX = 72;
export const PIXELS_PER_MINUTE = 1.2;
export const STACK_PEEK_PX = 10;
const HORIZONTAL_INSET_PX = 4;

export interface LayoutedCalendarEvent extends CalendarEvent {
  topPx: number;
  heightPx: number;
  leftPx: number;
  widthPx: number;
  stackIndex: number;
  stackSize: number;
  clusterId: string;
}

export function eventHeightPx(startMinutes: number, endMinutes: number): number {
  const durationMinutes = Math.max(endMinutes - startMinutes, 0);
  return Math.max(EVENT_BLOCK_MIN_HEIGHT_PX, durationMinutes * PIXELS_PER_MINUTE);
}

function timesOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;
}

function buildOverlapClusters(events: CalendarEvent[]): CalendarEvent[][] {
  if (events.length === 0) return [];

  const parent = events.map((_, index) => index);

  function find(index: number): number {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  }

  function union(a: number, b: number) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (timesOverlap(events[i], events[j])) union(i, j);
    }
  }

  const groups = new Map<number, CalendarEvent[]>();
  for (let i = 0; i < events.length; i++) {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(events[i]);
    groups.set(root, group);
  }

  return [...groups.values()];
}

/** Positions duration-scaled cards on a minute-based axis; overlapping ranges share a stack with peek offsets. */
export function layoutDayEvents(events: CalendarEvent[], windowStart: number, columnWidthPx: number): LayoutedCalendarEvent[] {
  if (events.length === 0) return [];

  const contentWidthPx = Math.max(columnWidthPx - HORIZONTAL_INSET_PX * 2, 0);
  const layouted: LayoutedCalendarEvent[] = [];

  for (const cluster of buildOverlapClusters(events)) {
    const sorted = [...cluster].sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return b.endMinutes - a.endMinutes;
    });
    const clusterId = sorted.map((event) => event.id).join("|");
    const stackSize = sorted.length;

    sorted.forEach((event, stackIndex) => {
      layouted.push({
        ...event,
        topPx: (event.startMinutes - windowStart) * PIXELS_PER_MINUTE,
        heightPx: eventHeightPx(event.startMinutes, event.endMinutes),
        leftPx: HORIZONTAL_INSET_PX + stackIndex * STACK_PEEK_PX,
        widthPx: contentWidthPx - stackIndex * STACK_PEEK_PX,
        stackIndex,
        stackSize,
        clusterId,
      });
    });
  }

  return layouted;
}

export function weekGridHeightPx(windowStart: number, windowEnd: number): number {
  return (windowEnd - windowStart) * PIXELS_PER_MINUTE + EVENT_BLOCK_MIN_HEIGHT_PX;
}
