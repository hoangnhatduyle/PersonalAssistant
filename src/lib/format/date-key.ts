/**
 * Calendar dates as "YYYY-MM-DD" keys — the format every date field in the
 * API and database uses. Pure string/arithmetic helpers with no time zone in
 * them: a date key means the same calendar day everywhere, and converting a
 * key to an instant needs a zone (see zonedPartsToIso in zoned-datetime.ts).
 */

export interface DateKeyParts {
  year: number;
  month: number;
  day: number;
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TYPED_ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TYPED_US_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const pad2 = (n: number): string => String(n).padStart(2, "0");

function isRealDate(year: number, month: number, day: number): boolean {
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** Strict "YYYY-MM-DD" → parts; null for anything else or a date that doesn't exist (e.g. Feb 30). */
export function parseDateKey(key: string | null | undefined): DateKeyParts | null {
  if (!key) return null;
  const match = DATE_KEY_RE.exec(key);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isRealDate(parts.year, parts.month, parts.day) ? parts : null;
}

export function formatDateKey({ year, month, day }: DateKeyParts): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** `key` shifted by `days` calendar days (negative to go back). Throws on an invalid key — callers pass keys they already validated. */
export function addDaysToDateKey(key: string, days: number): string {
  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid date key: ${key}`);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatDateKey({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

/**
 * A date key as a Date for react-day-picker: local noon of that calendar day,
 * so no zone/DST shift can move it onto a neighboring day. Undefined for an
 * empty or invalid key.
 */
export function dateKeyToCalendarDate(key: string | null | undefined): Date | undefined {
  const parts = parseDateKey(key);
  return parts ? new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0) : undefined;
}

/** The calendar day a picker-produced Date shows (its local year/month/day) as a date key. */
export function calendarDateToDateKey(date: Date): string {
  return formatDateKey({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/** Parses what a user types into a date field — "2030-06-01", "2030-6-1" or "6/1/2030" — to a date key; null if it isn't a complete, real date. */
export function parseTypedDate(text: string): string | null {
  const trimmed = text.trim();
  const iso = TYPED_ISO_RE.exec(trimmed);
  if (iso) {
    const parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isRealDate(parts.year, parts.month, parts.day) ? formatDateKey(parts) : null;
  }
  const us = TYPED_US_RE.exec(trimmed);
  if (us) {
    const parts = { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) };
    return isRealDate(parts.year, parts.month, parts.day) ? formatDateKey(parts) : null;
  }
  return null;
}

/** "11/6/2026" — the same M/D/YYYY the app's formatDate shows elsewhere; empty for an empty or invalid key. */
export function formatDateKeyForDisplay(key: string | null | undefined): string {
  const parts = parseDateKey(key);
  return parts ? `${parts.month}/${parts.day}/${parts.year}` : "";
}
