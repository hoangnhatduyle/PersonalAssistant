import { expandBlockForDateKeys, toDateOnly, type MeetingBlock } from "@/lib/calendar/recurrence";

/**
 * Per-occurrence exceptions to a recurring course/appointment ("this Thursday
 * I start at 1 PM", "skip this Tuesday"), applied on top of the weekly
 * pattern. See supabase/migrations/0061_occurrence_overrides.sql.
 *
 * Every reader that asks "what does this recurring thing do on that date?"
 * goes through here instead of calling the expand functions in recurrence.ts
 * directly — the week grid, conflict detection, Up Next, the voice schedule —
 * so they can never disagree about an exception. With no overrides the result
 * is exactly what the recurrence.ts functions return (pinned by a test).
 *
 * An occurrence is identified by where the SERIES puts it — (original date,
 * original start minutes) — not where an override moved it. An override that
 * names an occurrence the series doesn't have (the pattern was edited since)
 * is ignored.
 */

/** One row of `occurrence_overrides`, as embedded on a course/appointment. */
export interface OccurrenceOverride {
  original_date: string;
  original_start_minutes: number;
  is_cancelled: boolean;
  new_date: string | null;
  new_start_minutes: number | null;
  new_end_minutes: number | null;
}

/** What a recurring course/appointment contributes: its weekly pattern, its date range, and its exceptions. */
export interface RecurrenceSource {
  meeting_blocks: MeetingBlock[];
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  occurrence_overrides?: OccurrenceOverride[] | null;
}

export interface ResolvedOccurrence {
  /** Index into meeting_blocks of the block that produces this occurrence in the series. */
  blockIndex: number;
  /** Where the series puts it — the identity an override, and a recurring appointment's done/missed status, are keyed by. */
  originalDate: string;
  originalStartMinutes: number;
  /** Where it sits now (differs from the original when an override moved it). */
  date: string;
  startMinutes: number;
  endMinutes: number;
  isOverridden: boolean;
}

const MAX_DAYS_AHEAD = 366;

const occurrenceKey = (date: string, startMinutes: number) => `${date}|${startMinutes}`;

/** The block that produces the occurrence at (date, start) in the series, or null if the series has no such occurrence. */
export function findSeriesOccurrence(
  source: Pick<RecurrenceSource, "meeting_blocks" | "recurrence_start_date" | "recurrence_end_date">,
  originalDate: string,
  originalStartMinutes: number,
): { blockIndex: number; endMinutes: number } | null {
  for (const [blockIndex, block] of source.meeting_blocks.entries()) {
    if (block.startMinutes !== originalStartMinutes) continue;
    const meets = expandBlockForDateKeys(block, [originalDate], source.recurrence_start_date, source.recurrence_end_date);
    if (meets.length > 0) return { blockIndex, endMinutes: block.endMinutes };
  }
  return null;
}

/**
 * Every occurrence that SITS on one of `dateKeys` ("YYYY-MM-DD"): the series'
 * own occurrences minus any cancelled or moved away, plus any occurrence
 * moved onto one of those dates (even from a date outside the list).
 * Ordered block by block, then by date, with moved-in occurrences last.
 */
export function resolveOccurrencesOnDates(source: RecurrenceSource, dateKeys: string[]): ResolvedOccurrence[] {
  const overrides = source.occurrence_overrides ?? [];
  const overrideByOccurrence = new Map(overrides.map((override) => [occurrenceKey(override.original_date, override.original_start_minutes), override]));
  const wanted = new Set(dateKeys);
  const resolved: ResolvedOccurrence[] = [];

  source.meeting_blocks.forEach((block, blockIndex) => {
    for (const occurrence of expandBlockForDateKeys(block, dateKeys, source.recurrence_start_date, source.recurrence_end_date)) {
      // Cancelled, or moved (and so placed by the pass below): not at its series position any more.
      if (overrideByOccurrence.has(occurrenceKey(occurrence.dateKey, occurrence.startMinutes))) continue;
      resolved.push({
        blockIndex,
        originalDate: occurrence.dateKey,
        originalStartMinutes: occurrence.startMinutes,
        date: occurrence.dateKey,
        startMinutes: occurrence.startMinutes,
        endMinutes: occurrence.endMinutes,
        isOverridden: false,
      });
    }
  });

  for (const override of overrides) {
    if (override.is_cancelled) continue;
    const { new_date: date, new_start_minutes: startMinutes, new_end_minutes: endMinutes } = override;
    if (date === null || startMinutes === null || endMinutes === null || !wanted.has(date)) continue;
    const series = findSeriesOccurrence(source, override.original_date, override.original_start_minutes);
    if (!series) continue; // stale: the pattern no longer has the occurrence it names
    resolved.push({
      blockIndex: series.blockIndex,
      originalDate: override.original_date,
      originalStartMinutes: override.original_start_minutes,
      date,
      startMinutes,
      endMinutes,
      isOverridden: true,
    });
  }

  return resolved;
}

/** `resolveOccurrencesOnDates` for the days of [weekStart, weekEnd) — local calendar days, as the week grid draws them. */
export function resolveOccurrencesInWeek(source: RecurrenceSource, weekStart: Date, weekEnd: Date): ResolvedOccurrence[] {
  const dateKeys: string[] = [];
  for (const cursor = new Date(weekStart); cursor < weekEnd; cursor.setDate(cursor.getDate() + 1)) dateKeys.push(toDateOnly(cursor));
  return resolveOccurrencesOnDates(source, dateKeys);
}

/**
 * The next occurrence at or after `referenceDate` (today's counts only if it
 * hasn't started yet), honouring overrides: a cancelled one is skipped and a
 * moved one is judged at its new date and time. Scans a year ahead, like
 * getNextOccurrence. `dateObj` is that date at local midnight.
 */
export function getNextResolvedOccurrence(source: RecurrenceSource, referenceDate: Date): (ResolvedOccurrence & { dateObj: Date }) | null {
  if (source.meeting_blocks.length === 0) return null;

  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dateKeys: string[] = [];
  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    dateKeys.push(toDateOnly(day));
  }

  const todayKey = dateKeys[0];
  const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const upcoming = resolveOccurrencesOnDates(source, dateKeys)
    .filter((occurrence) => occurrence.date > todayKey || (occurrence.date === todayKey && occurrence.startMinutes >= nowMinutes))
    .sort((a, b) => (a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1));

  const next = upcoming[0];
  if (!next) return null;
  const [year, month, day] = next.date.split("-").map(Number);
  return { ...next, dateObj: new Date(year, month - 1, day) };
}
