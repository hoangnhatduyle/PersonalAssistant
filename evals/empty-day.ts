/**
 * Picks a day the eval fixture guarantees is empty, whatever weekday the eval
 * happens to run on.
 *
 * The fixture's dated items all fall within ten days of "today", but its
 * courses meet every week on Monday through Thursday. So a day N days out is
 * empty only if it is a Friday, Saturday or Sunday -- and "three weeks from
 * today" has TODAY's weekday, which made the old "empty day" case ask about a
 * class day whenever the eval ran Monday to Thursday. Worse, its check rewarded
 * answering "nothing" there: a baseline recorded on a Monday had the model
 * passing by missing a real class.
 *
 * Pure (no fixture or database imports) so it is unit-tested for every
 * starting weekday: src/lib/voice/__tests__/eval-baseline.test.ts.
 */

/** Weekdays with no recurring fixture meeting: Friday, Saturday, Sunday (0 = Sunday). */
const EMPTY_WEEKDAYS = new Set([5, 6, 0]);

/** The first offset at or beyond `minOffset` falling on an empty weekday. Always within four days of it (a Monday start reaches its first Friday at +4). */
export function emptyDayOffset(weekdayOf: (offsetDays: number) => number, minOffset = 14): number {
  for (let offset = minOffset; offset < minOffset + 7; offset++) {
    if (EMPTY_WEEKDAYS.has(weekdayOf(offset))) return offset;
  }
  throw new Error("no empty weekday found -- EMPTY_WEEKDAYS must cover at least one day in any seven");
}

/** "2026-11-28" -> "Saturday, November 28": how a person would name the day. */
export function describeDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
