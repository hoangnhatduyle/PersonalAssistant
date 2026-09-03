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

/**
 * The UTC instant one millisecond before `year-month-(day+1) 00:00:00` local
 * wall-clock time in `timeZone` -- i.e. the last instant of that local
 * calendar day (23:59:59.999 local time). `day + 1` is passed straight to
 * `Date.UTC` inside localMidnightUtc, which rolls month/year boundaries
 * correctly on its own (e.g. day 31 of a 30-day month rolls into next
 * month) -- no separate calendar-math needed here.
 *
 * For anchoring a date-only value (e.g. todo_items.due_date, which has no
 * time-of-day or timezone of its own) to a real, timezone-correct instant
 * for day-bucketing (schedule-formatting.ts's rankScheduleItems) -- unlike
 * a bare `new Date(dateKey + "T23:59:59.999")`, which parses in whatever
 * timezone the Node process itself happens to be running in, not the
 * user's, and can silently bucket the item onto the wrong calendar day for
 * any user east of UTC.
 */
export function localEndOfDayUtc(year: number, month: number, day: number, timeZone: string): Date {
  return new Date(localMidnightUtc(year, month, day + 1, timeZone).getTime() - 1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days after today's local midnight a window starts, and how many days it spans. Shared by both the instant-based and date-key-based resolvers below. */
function windowOffsetAndSpanDays(window: "today" | "tomorrow" | "week"): { offsetDays: number; spanDays: number } {
  switch (window) {
    case "today":
      return { offsetDays: 0, spanDays: 1 };
    case "tomorrow":
      return { offsetDays: 1, spanDays: 1 };
    case "week":
      // Matches the dashboard's own 7days semantics (today through 6 days
      // from now, inclusive) -- computed here against the user's real
      // timezone instead of client-local time.
      return { offsetDays: 0, spanDays: 7 };
  }
}

/** Returns null for "unscoped" (no filtering — the legacy/default behavior). */
export function resolveScheduleWindowBounds(
  window: ScheduleTimeWindow,
  timezone: string,
  now: Date = new Date(),
): ScheduleWindowBounds | null {
  if (window === "unscoped") return null;

  const nowParts = partsInZone(now, timezone);
  const todayMidnight = localMidnightUtc(nowParts.year, nowParts.month, nowParts.day, timezone);
  const { offsetDays, spanDays } = windowOffsetAndSpanDays(window);
  const startMs = todayMidnight.getTime() + offsetDays * DAY_MS;

  return {
    startUtcIso: new Date(startMs).toISOString(),
    endUtcIsoExclusive: new Date(startMs + spanDays * DAY_MS).toISOString(),
  };
}

export interface ScheduleWindowDateKeys {
  /** Inclusive lower bound, calendar date (YYYY-MM-DD) in the caller's timezone. */
  startDateKey: string;
  /** Exclusive upper bound, calendar date (YYYY-MM-DD) in the caller's timezone. */
  endDateKeyExclusive: string;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Same window semantics as resolveScheduleWindowBounds, expressed as plain
 * calendar-date strings instead of UTC instants -- for filtering a `date`
 * column (e.g. todo_items.due_date), which has no time-of-day/timezone
 * component to convert. Pure calendar-day arithmetic (never converts back
 * through a real timezone), so unlike the instant-based resolver above this
 * has no DST edge case at all. Returns null for "unscoped".
 */
export function resolveScheduleWindowDateKeys(
  window: ScheduleTimeWindow,
  timezone: string,
  now: Date = new Date(),
): ScheduleWindowDateKeys | null {
  if (window === "unscoped") return null;

  const { year, month, day } = partsInZone(now, timezone);
  // Date.UTC/getUTC* here are pure calendar-day arithmetic on a Y-M-D
  // triple, not a real timezone conversion -- "UTC" is just an arbitrary
  // fixed-offset clock used so adding days never crosses a DST boundary.
  const todayAsUtcMidnight = Date.UTC(year, month - 1, day);
  const { offsetDays, spanDays } = windowOffsetAndSpanDays(window);
  const start = new Date(todayAsUtcMidnight + offsetDays * DAY_MS);
  const end = new Date(start.getTime() + spanDays * DAY_MS);

  return {
    startDateKey: dateKey(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
    endDateKeyExclusive: dateKey(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
  };
}
