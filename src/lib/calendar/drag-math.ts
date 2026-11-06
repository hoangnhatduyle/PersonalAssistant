import { PIXELS_PER_MINUTE } from "@/lib/calendar/layout-day-events";

/**
 * Pure geometry for dragging and resizing calendar blocks: pixel travel in,
 * snapped times out. No DOM here — the pointer hook measures, these decide.
 */

export const SNAP_MINUTES = 15;
/** Shortest a block can be resized to. */
export const MIN_RESIZE_MINUTES = 15;
const DAY_MINUTES = 24 * 60;
/** A point marker (deadline/task) can be dragged as late as 23:45. */
const LAST_POINT_START_MINUTES = DAY_MINUTES - SNAP_MINUTES;

/** Where a calendar block sits: its column's date plus start/end minutes-of-day. */
export interface EventTimes {
  date: string;
  startMinutes: number;
  endMinutes: number;
}

export function snapToMinutes(minutes: number, snap: number = SNAP_MINUTES): number {
  return Math.round(minutes / snap) * snap;
}

/**
 * The block's new position after the pointer travelled `deltaYpx` vertically
 * (scroll included) and is now over the column dated `targetDate`. The start
 * moves by the snapped travel and the duration is kept; the block is held
 * inside the day. A point marker (deadline/task — its drawn 45 minutes are
 * not a real duration) is clamped as if zero-length.
 */
export function previewMove(
  original: EventTimes,
  deltaYpx: number,
  targetDate: string,
  options: { isPoint?: boolean } = {},
): EventTimes {
  const duration = original.endMinutes - original.startMinutes;
  const travel = snapToMinutes(deltaYpx / PIXELS_PER_MINUTE);
  // A sideways move (no vertical travel worth a snap step) changes only the date: the exact time is kept, not
  // re-snapped or clamped — a 11:59 PM deadline must not become 11:45 PM just because it changed day.
  if (travel === 0) return { date: targetDate, startMinutes: original.startMinutes, endMinutes: original.endMinutes };

  const runsPastMidnight = original.endMinutes > DAY_MINUTES;
  const latestStart = options.isPoint
    ? LAST_POINT_START_MINUTES
    : Math.max(0, DAY_MINUTES - duration, runsPastMidnight ? original.startMinutes : 0);
  const startMinutes = Math.min(Math.max(snapToMinutes(original.startMinutes + travel), 0), latestStart);
  return { date: targetDate, startMinutes, endMinutes: startMinutes + duration };
}

/** The block's new position after its bottom edge travelled `deltaYpx`: only the end moves (snapped, at least 15 minutes, at most midnight — or its current end if that is already later). */
export function previewResize(original: EventTimes, deltaYpx: number): EventTimes {
  const travelled = snapToMinutes(original.endMinutes + deltaYpx / PIXELS_PER_MINUTE);
  const latestEnd = Math.max(DAY_MINUTES, original.endMinutes);
  const endMinutes = Math.min(Math.max(travelled, original.startMinutes + MIN_RESIZE_MINUTES), latestEnd);
  return { ...original, endMinutes };
}

export interface ColumnBounds {
  date: string;
  left: number;
  right: number;
}

/** The date of the column under horizontal position `x`; outside the grid, the nearest edge column. Null when there are no columns. */
export function columnDateAtX(x: number, columns: ColumnBounds[]): string | null {
  if (columns.length === 0) return null;
  const inside = columns.find((column) => x >= column.left && x < column.right);
  if (inside) return inside.date;
  const first = columns[0];
  const last = columns[columns.length - 1];
  return x < first.left ? first.date : last.date;
}

export function isSameTimes(a: EventTimes, b: EventTimes): boolean {
  return a.date === b.date && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes;
}
