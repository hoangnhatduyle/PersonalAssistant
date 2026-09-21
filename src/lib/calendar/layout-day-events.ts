import type { CalendarEvent } from "@/lib/calendar/build-week-events";

/** Minimum height so name, time, and location always fit on short events. */
export const EVENT_BLOCK_MIN_HEIGHT_PX = 72;
/** Smallest a block is ever trimmed to when the next event is close behind it; EventBlock drops detail lines to fit. */
export const COMPACT_EVENT_MIN_HEIGHT_PX = 28;
const EVENT_GAP_PX = 2;
export const PIXELS_PER_MINUTE = 1.2;
export const STACK_PEEK_PX = 10;
const HORIZONTAL_INSET_PX = 4;

export interface LayoutedCalendarEvent extends CalendarEvent {
  topPx: number;
  heightPx: number;
  /** Height not covered by the card layered on top of this one in its stack; equals `heightPx` for the top card. */
  visibleHeightPx: number;
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

/**
 * Minute the block's bottom edge reaches at its smallest drawn size (real duration,
 * floored at the compact height plus a gap). Grouping on this instead of the raw end
 * time means two events are only stacked when trimming cannot keep them apart.
 */
function compactDrawnEndMinutes(event: CalendarEvent): number {
  const durationMinutes = Math.max(event.endMinutes - event.startMinutes, 0);
  return event.startMinutes + Math.max(durationMinutes, (COMPACT_EVENT_MIN_HEIGHT_PX + EVENT_GAP_PX) / PIXELS_PER_MINUTE);
}

function timesOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.startMinutes < compactDrawnEndMinutes(b) && compactDrawnEndMinutes(a) > b.startMinutes;
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

/** Earliest start among events in other clusters that begin after this one — the nearest thing it could be drawn over. */
function nextStartAfter(event: CalendarEvent, clusters: CalendarEvent[][], ownClusterIndex: number): number | undefined {
  let next: number | undefined;
  clusters.forEach((cluster, index) => {
    if (index === ownClusterIndex) return;
    for (const other of cluster) {
      if (other.startMinutes < event.startMinutes) continue;
      if (next === undefined || other.startMinutes < next) next = other.startMinutes;
    }
  });
  return next;
}

/** Trims a block so it ends before the next event's start, when the full minimum height would run into it. */
function heightBeforeNextEventPx(event: CalendarEvent, nextStartMinutes: number | undefined): number {
  const naturalPx = eventHeightPx(event.startMinutes, event.endMinutes);
  if (nextStartMinutes === undefined) return naturalPx;
  const roomPx = (nextStartMinutes - event.startMinutes) * PIXELS_PER_MINUTE - EVENT_GAP_PX;
  return Math.min(naturalPx, Math.max(roomPx, COMPACT_EVENT_MIN_HEIGHT_PX));
}

/**
 * Positions duration-scaled cards on a minute-based axis; ranges that overlap in real
 * time share a stack with peek offsets. Blocks that merely touch (or are padded to the
 * minimum height) are trimmed so they never draw over the event that follows.
 */
export function layoutDayEvents(events: CalendarEvent[], windowStart: number, columnWidthPx: number): LayoutedCalendarEvent[] {
  if (events.length === 0) return [];

  const contentWidthPx = Math.max(columnWidthPx - HORIZONTAL_INSET_PX * 2, 0);
  const layouted: LayoutedCalendarEvent[] = [];

  const clusters = buildOverlapClusters(events);

  clusters.forEach((cluster, clusterIndex) => {
    const sorted = [...cluster].sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return b.endMinutes - a.endMinutes;
    });
    const clusterId = sorted.map((event) => event.id).join("|");
    const stackSize = sorted.length;

    sorted.forEach((event, stackIndex) => {
      const heightPx = heightBeforeNextEventPx(event, nextStartAfter(event, clusters, clusterIndex));
      const cardOnTop = sorted[stackIndex + 1];
      const uncoveredPx = cardOnTop ? (cardOnTop.startMinutes - event.startMinutes) * PIXELS_PER_MINUTE : heightPx;
      layouted.push({
        ...event,
        topPx: (event.startMinutes - windowStart) * PIXELS_PER_MINUTE,
        heightPx,
        visibleHeightPx: Math.min(heightPx, uncoveredPx),
        leftPx: HORIZONTAL_INSET_PX + stackIndex * STACK_PEEK_PX,
        widthPx: contentWidthPx - stackIndex * STACK_PEEK_PX,
        stackIndex,
        stackSize,
        clusterId,
      });
    });
  });

  return layouted;
}

export function weekGridHeightPx(windowStart: number, windowEnd: number): number {
  return (windowEnd - windowStart) * PIXELS_PER_MINUTE + EVENT_BLOCK_MIN_HEIGHT_PX;
}

/** Converts a click's vertical offset into a snapped minutes-of-day value, for empty-slot event creation. */
export function pxToMinutes(offsetY: number, windowStart: number, snapMinutes = 30): number {
  const raw = windowStart + offsetY / PIXELS_PER_MINUTE;
  const snapped = Math.round(raw / snapMinutes) * snapMinutes;
  return Math.min(Math.max(snapped, 0), 24 * 60 - snapMinutes);
}
