import { addDaysToDateKey, localEndOfDayUtc, partsInZone, type ZonedParts } from "@/lib/voice/schedule-time-window";

/**
 * Client/voice-side helpers for weekly Deadline recurrence. Days are
 * 0=Sunday..6=Saturday. Creating each next occurrence is the database's job
 * (supabase/migrations/0042_deadline_series.sql).
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDateKey(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dayOfWeek(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "Repeats every Monday, Wednesday and Friday until 2026-12-11", or null when not recurring. */
export function formatDeadlineRecurrence(days: number[], endDate: string | null): string | null {
  if (days.length === 0) return null;
  const names = [...new Set(days)].sort((a, b) => a - b).map((day) => DAY_NAMES[day]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Repeats every ${list}${endDate ? ` until ${endDate}` : ""}`;
}

/**
 * A recurring deadline created with no stated time (voice: "add a weekly
 * quiz every Friday"): the end of the first selected weekday on or after
 * today in `timeZone`, mirroring how a one-off deadline with no date
 * defaults to end-of-today. Null when no days are given.
 */
export function getFirstOccurrenceEndOfDay(days: number[], timeZone: string, now: Date = new Date()): string | null {
  if (days.length === 0) return null;
  const todayKey = toDateKey(partsInZone(now, timeZone));
  for (let offset = 0; offset < 7; offset++) {
    const candidateKey = addDaysToDateKey(todayKey, offset);
    if (!days.includes(dayOfWeek(candidateKey))) continue;
    const [year, month, day] = candidateKey.split("-").map(Number);
    return localEndOfDayUtc(year, month, day, timeZone).toISOString();
  }
  return null;
}
