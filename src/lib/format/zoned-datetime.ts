/**
 * Date and time display in an explicit time zone.
 *
 * Every due date, reminder time and "saved on" date in the app is stored as a
 * UTC instant, and a bare toLocaleString() shows it in whatever zone the
 * device (or a server) reports. A deadline stored as 04:59 UTC (11:59 PM in
 * Detroit) was shown as "4:59 AM" the next day. These helpers always take the
 * zone the user chose in Settings (see useUserTimezone).
 */

export const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

// Newer ICU data separates the time from AM/PM with a narrow no-break space (U+202F).
// It looks like a space but breaks string comparison, copy/paste and tests.
const NARROW_NO_BREAK_SPACE = / /g;

function format(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    // An unrecognized zone name (RangeError): show the time in the device's zone rather than crash the screen.
    formatter = new Intl.DateTimeFormat("en-US", options);
  }
  return formatter.format(date).replace(NARROW_NO_BREAK_SPACE, " ");
}

/** "11/10/2026, 11:59 PM" in the given IANA zone. Empty string for an invalid date. */
export function formatDateTime(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions = DATE_TIME_FORMAT): string {
  return format(value, timeZone, options);
}

/** "11/10/2026" in the given IANA zone, or whatever calendar parts `options` asks for. Empty string for an invalid date. */
export function formatDate(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions = DATE_FORMAT): string {
  return format(value, timeZone, options);
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** `timeZone` if the runtime recognizes it, else the device's zone — an unknown zone name must not crash a screen. */
function resolveZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

/** The wall-clock year/month/day/hour/minute/second `date` reads as in `timeZone` (24-hour clock). */
export function partsInZone(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

function toDateKey(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Today's calendar date ("YYYY-MM-DD") in `timeZone` — not the device's or UTC's date. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return toDateKey(partsInZone(now, timeZone));
}

/** An instant as the wall-clock date ("YYYY-MM-DD") and time ("HH:mm") it reads as in `timeZone`; null for an empty/invalid value. */
export function isoToZonedParts(iso: string | null | undefined, timeZone: string): { date: string; time: string } | null {
  if (!iso) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = partsInZone(instant, timeZone);
  return { date: toDateKey(parts), time: `${pad2(parts.hour)}:${pad2(parts.minute)}` };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The UTC instant (ISO string) at which the wall clock in `timeZone` reads
 * `dateKey` ("YYYY-MM-DD") `time` ("HH:mm"); null for a malformed or
 * impossible date/time. Resolves the zone's offset on that date, including a
 * daylight-saving change that day. A wall-clock time that doesn't exist
 * (spring-forward gap) lands the same distance after the gap; an ambiguous
 * one (fall-back overlap) resolves to the earlier of the two instants.
 */
export function zonedPartsToIso(dateKey: string, time: string, timeZone: string): string | null {
  const dateMatch = DATE_KEY_RE.exec(dateKey);
  const timeMatch = TIME_RE.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])];

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const calendarCheck = new Date(wallClockAsUtc);
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) {
    return null;
  }

  const offsetAt = (instantMs: number): number => {
    const p = partsInZone(new Date(instantMs), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instantMs;
  };

  // The zone's offset a day before and a day after the wall-clock time. They
  // differ only on a daylight-saving day, and each yields a candidate instant;
  // a candidate is real only if the zone really has that offset at it.
  const offsetBefore = offsetAt(wallClockAsUtc - DAY_MS);
  const offsetAfter = offsetAt(wallClockAsUtc + DAY_MS);
  const candidateBefore = wallClockAsUtc - offsetBefore;
  if (offsetBefore === offsetAfter) return new Date(candidateBefore).toISOString();

  const candidateAfter = wallClockAsUtc - offsetAfter;
  const beforeIsReal = offsetAt(candidateBefore) === offsetBefore;
  const afterIsReal = offsetAt(candidateAfter) === offsetAfter;
  if (beforeIsReal && afterIsReal) return new Date(Math.min(candidateBefore, candidateAfter)).toISOString(); // fall-back overlap: the earlier
  if (afterIsReal) return new Date(candidateAfter).toISOString();
  // Spring-forward gap (neither is real) uses the pre-change offset, landing just after the gap.
  return new Date(candidateBefore).toISOString();
}
