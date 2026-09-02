// Server-side, timezone-aware day-boundary computation for
// runUpcomingScheduleQuery's "today"/"tomorrow"/"week" scoping (session.ts).
//
// Deliberately NOT built on src/lib/dashboard/upcoming-items.ts's
// localDayOffset/TimeWindowFilter: that logic reads bare JS Date methods
// (getFullYear/getMonth/getDate), which report the *server process's* local
// timezone (or the browser's, when it runs client-side) -- never the end
// user's actual IANA timezone. Reusing it here would silently compute
// "today" in the wrong timezone, reproducing the exact bug this module
// exists to fix. The user's real timezone is already available server-side
// via loadUserTimezone (src/lib/voice/intent.ts).
//
// No timezone library is a dependency of this repo today, so local-midnight
// is computed with Intl.DateTimeFormat using the standard "guess, then
// correct by the observed offset" technique other timezone libraries (e.g.
// date-fns-tz's zonedTimeToUtc) use internally. This has one known, accepted
// edge case: a comparison can be off by the DST delta if "now" itself falls
// within the ambiguous/skipped hour of a DST transition. Acceptable for
// day-bucketing a spoken schedule summary; not acceptable for exact
// reminder-firing math (this module is never used for that).

export type ScheduleTimeWindow = "today" | "tomorrow" | "week" | "unscoped";

export interface ScheduleWindowBounds {
  /** Inclusive lower bound, UTC ISO 8601. */
  startUtcIso: string;
  /** Exclusive upper bound, UTC ISO 8601. */
  endUtcIsoExclusive: string;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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

function partsToUtcMillis(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** The UTC instant that reads as `year-month-day 00:00:00` local wall-clock time in `timeZone`. */
function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guessMillis = Date.UTC(year, month - 1, day, 0, 0, 0);
  const guessDate = new Date(guessMillis);
  const partsAtGuess = partsInZone(guessDate, timeZone);
  const offset = partsToUtcMillis(partsAtGuess) - guessMillis;
  return new Date(guessMillis - offset);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns null for "unscoped" (no filtering — the legacy/default behavior). */
export function resolveScheduleWindowBounds(
  window: ScheduleTimeWindow,
  timezone: string,
  now: Date = new Date(),
): ScheduleWindowBounds | null {
  if (window === "unscoped") return null;

  const nowParts = partsInZone(now, timezone);
  const todayMidnight = localMidnightUtc(nowParts.year, nowParts.month, nowParts.day, timezone);

  let startMs: number;
  let spanDays: number;
  switch (window) {
    case "today":
      startMs = todayMidnight.getTime();
      spanDays = 1;
      break;
    case "tomorrow":
      startMs = todayMidnight.getTime() + DAY_MS;
      spanDays = 1;
      break;
    case "week":
      // Matches the dashboard's own 7days semantics (today through 6 days
      // from now, inclusive) -- computed here against the user's real
      // timezone instead of client-local time.
      startMs = todayMidnight.getTime();
      spanDays = 7;
      break;
  }

  return {
    startUtcIso: new Date(startMs).toISOString(),
    endUtcIsoExclusive: new Date(startMs + spanDays * DAY_MS).toISOString(),
  };
}
