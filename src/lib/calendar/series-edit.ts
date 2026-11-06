import type { MeetingBlock } from "@/lib/calendar/recurrence";

/** The API's cap on time windows per course/appointment (meeting_blocks .max(10) in schemas.ts). */
export const MAX_MEETING_BLOCKS = 10;

export interface SeriesEdit {
  /** The block that produces the occurrence the user dragged. */
  blockIndex: number;
  /** The weekday that occurrence sat on in the series, and the one it was dropped on. */
  fromDayOfWeek: number;
  toDayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}

const sortedDays = (days: number[]) => [...days].sort((a, b) => a - b);

/**
 * The weekly pattern after "All occurrences": every `fromDayOfWeek` meeting of
 * the dragged block now happens on `toDayOfWeek` at the new times.
 *
 * Only that WEEKDAY changes. A block usually covers several days (Mon, Tue,
 * Thu, Fri at 8:30-4:30), and dragging one Thursday must not move the others,
 * so the weekday is split off the block into its own window — or joins an
 * existing window that already has exactly the new times, rather than leaving
 * a near-duplicate. A single-day block is edited where it stands.
 *
 * Pure: returns a new array. Null when the edit can't be represented — times
 * that don't fit in a day, a source day the block doesn't have, or more than
 * the maximum number of windows.
 */
export function applySeriesEdit(blocks: MeetingBlock[], edit: SeriesEdit): MeetingBlock[] | null {
  const source = blocks[edit.blockIndex];
  if (!source || !source.days.includes(edit.fromDayOfWeek)) return null;
  if (edit.startMinutes < 0 || edit.endMinutes > 1439 || edit.endMinutes <= edit.startMinutes) return null;

  const remaining: MeetingBlock[] = blocks.map((block, index) =>
    index === edit.blockIndex ? { ...block, days: block.days.filter((day) => day !== edit.fromDayOfWeek) } : { ...block, days: [...block.days] },
  );
  const sourceIsEmptied = remaining[edit.blockIndex].days.length === 0;

  const joinable = remaining.findIndex(
    (block) => block.days.length > 0 && block.startMinutes === edit.startMinutes && block.endMinutes === edit.endMinutes,
  );

  if (joinable >= 0) {
    if (!remaining[joinable].days.includes(edit.toDayOfWeek)) remaining[joinable].days.push(edit.toDayOfWeek);
  } else if (sourceIsEmptied) {
    remaining[edit.blockIndex] = { days: [edit.toDayOfWeek], startMinutes: edit.startMinutes, endMinutes: edit.endMinutes };
  } else {
    remaining.push({ days: [edit.toDayOfWeek], startMinutes: edit.startMinutes, endMinutes: edit.endMinutes });
  }

  const result = remaining.filter((block) => block.days.length > 0).map((block) => ({ ...block, days: sortedDays(block.days) }));
  return result.length > MAX_MEETING_BLOCKS ? null : result;
}
