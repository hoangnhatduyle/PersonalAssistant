import { addDaysToDateKey, localMidnightUtc } from "@/lib/voice/schedule-time-window";
import { zonedDateKey } from "@/lib/voice/schedule-formatting";
import type { WeeklyReviewWindow } from "@/lib/weekly-review/types";

export const LAST_WINDOW_DAYS = 7;
export const NEXT_WINDOW_DAYS = 7;

function midnightForKey(key: string, timeZone: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return localMidnightUtc(year, month, day, timeZone);
}

/**
 * The review's two rolling windows, resolved in the user's own timezone
 * (the dashboard builders use the process's local time, which is wrong on a
 * UTC server in the evening):
 *   last = the 7 local days ending today (today-6 .. today)
 *   next = the 7 local days starting tomorrow
 * They never overlap, so on a Sunday "next" is exactly Monday-Sunday.
 */
export function resolveWeeklyReviewWindow(now: Date, timezone: string): WeeklyReviewWindow {
  const todayKey = zonedDateKey(now, timezone);
  const lastStartKey = addDaysToDateKey(todayKey, -(LAST_WINDOW_DAYS - 1));
  const nextStartKey = addDaysToDateKey(todayKey, 1);
  const nextEndKeyExclusive = addDaysToDateKey(nextStartKey, NEXT_WINDOW_DAYS);

  return {
    timezone,
    todayKey,
    lastStartKey,
    nextStartKey,
    nextEndKeyExclusive,
    lastStartUtc: midnightForKey(lastStartKey, timezone),
    todayStartUtc: midnightForKey(todayKey, timezone),
    tomorrowStartUtc: midnightForKey(nextStartKey, timezone),
    nextEndUtcExclusive: midnightForKey(nextEndKeyExclusive, timezone),
  };
}

/** "Thursday" for a "YYYY-MM-DD" key. Calendar math only, so no timezone is involved. */
export function weekdayName(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}
