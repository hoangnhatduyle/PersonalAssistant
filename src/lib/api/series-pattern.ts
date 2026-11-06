import type { MeetingBlock } from "@/lib/calendar/recurrence";

interface SeriesPattern {
  meeting_blocks: MeetingBlock[];
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
}

/** A block as plain, order-independent data: sorted days, fixed key order (Postgres jsonb returns keys in its own order). */
function canonicalBlock(block: MeetingBlock): string {
  return JSON.stringify([[...block.days].sort((a, b) => a - b), block.startMinutes, block.endMinutes]);
}

/**
 * Whether a PATCH to a recurring course/appointment actually changes its
 * pattern (time windows or date range) rather than resubmitting what is
 * already stored. Only a real change invalidates the series' per-occurrence
 * exceptions (see clearFutureOverridesIfPatternChanged).
 */
export function hasPatternChanged(
  before: SeriesPattern,
  patch: { meeting_blocks?: MeetingBlock[]; recurrence_start_date?: string | null; recurrence_end_date?: string | null },
): boolean {
  if (patch.meeting_blocks !== undefined) {
    const beforeBlocks = before.meeting_blocks.map(canonicalBlock);
    const afterBlocks = patch.meeting_blocks.map(canonicalBlock);
    if (beforeBlocks.length !== afterBlocks.length || beforeBlocks.some((block, index) => block !== afterBlocks[index])) return true;
  }
  if (patch.recurrence_start_date !== undefined && patch.recurrence_start_date !== before.recurrence_start_date) return true;
  if (patch.recurrence_end_date !== undefined && patch.recurrence_end_date !== before.recurrence_end_date) return true;
  return false;
}

/**
 * Exceptions on or after this date ("YYYY-MM-DD") are "future" for the purposes of dropping a series' stale
 * exceptions when its pattern changes; earlier ones stay as history. A day of slack behind UTC-now so an exception
 * on "today" in a time zone ahead of UTC is still treated as future. The server applies it (see
 * clearFutureOverridesIfPatternChanged) and the client mirrors it in its optimistic update.
 */
export function futureOverrideCutoff(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
