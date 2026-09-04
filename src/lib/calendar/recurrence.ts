/**
 * Structured course recurrence: a list of MeetingBlocks (which days, which
 * time window) plus an optional [recurrence_start_date, recurrence_end_date]
 * bound on the whole set. Replaces the old free-text meeting_pattern +
 * best-effort regex parser (parse-meeting-pattern.ts, deleted) — structured
 * data can't fail to parse, so there is no "unparseable" fallback state here.
 */

export interface MeetingBlock {
  /** 0=Sunday..6=Saturday, matching Date.prototype.getDay(). */
  days: number[];
  /** Minutes since midnight, 0-1439. */
  startMinutes: number;
  /** Minutes since midnight, 0-1439, > startMinutes. */
  endMinutes: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date-only ("YYYY-MM-DD") string comparison — both operands are already zero-padded, so lexical order matches calendar order. */
function isWithinRange(dateOnly: string, rangeStart: string | null, rangeEnd: string | null): boolean {
  if (rangeStart && dateOnly < rangeStart) return false;
  if (rangeEnd && dateOnly > rangeEnd) return false;
  return true;
}

/** "630" -> "10:30 AM" for hour-axis labels, event tooltips, and summary text. */
export function formatMinutesOfDay(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${meridiem}` : `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

/**
 * For a given displayed week [weekStart, weekEnd), which of a block's
 * matched weekdays actually fall inside [rangeStart, rangeEnd] (when set).
 * Used by build-week-events.ts to place course blocks on the calendar grid.
 */
export function expandBlockInWeek(
  block: MeetingBlock,
  weekStart: Date,
  weekEnd: Date,
  rangeStart: string | null,
  rangeEnd: string | null,
): Array<{ dayOfWeek: number; date: Date; startMinutes: number; endMinutes: number }> {
  const occurrences: Array<{ dayOfWeek: number; date: Date; startMinutes: number; endMinutes: number }> = [];
  for (let cursor = new Date(weekStart); cursor < weekEnd; cursor.setDate(cursor.getDate() + 1)) {
    const dayOfWeek = cursor.getDay();
    if (!block.days.includes(dayOfWeek)) continue;
    if (!isWithinRange(toDateOnly(cursor), rangeStart, rangeEnd)) continue;
    occurrences.push({ dayOfWeek, date: new Date(cursor), startMinutes: block.startMinutes, endMinutes: block.endMinutes });
  }
  return occurrences;
}

/**
 * For an explicit list of calendar dates ("YYYY-MM-DD" keys, caller-resolved
 * — this function does no timezone reasoning of its own), which of them a
 * block actually meets on, respecting [rangeStart, rangeEnd]. Unlike
 * expandBlockInWeek, this deliberately never constructs a Date from a real
 * timezone-anchored instant and calls local getters on it (that reads the
 * SERVER PROCESS's own timezone, not the user's -- the exact bug class
 * schedule-time-window.ts's header comment warns about). Day-of-week is
 * instead derived via Date.UTC + getUTCDay() on the bare Y-M-D triple --
 * "UTC" here is just an arbitrary fixed-offset calendar clock, mirroring
 * resolveScheduleWindowDateKeys's own technique, never a timezone claim.
 * Used server-side by schedule-loader.ts; expandBlockInWeek remains the
 * right tool for build-week-events.ts's client-side (browser-local-time)
 * usage and is untouched.
 */
export function expandBlockForDateKeys(
  block: MeetingBlock,
  dateKeys: string[],
  rangeStart: string | null,
  rangeEnd: string | null,
): Array<{ dateKey: string; startMinutes: number; endMinutes: number }> {
  const occurrences: Array<{ dateKey: string; startMinutes: number; endMinutes: number }> = [];
  for (const dateKey of dateKeys) {
    if (!isWithinRange(dateKey, rangeStart, rangeEnd)) continue;
    const [year, month, day] = dateKey.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (!block.days.includes(dayOfWeek)) continue;
    occurrences.push({ dateKey, startMinutes: block.startMinutes, endMinutes: block.endMinutes });
  }
  return occurrences;
}

/**
 * Nearest occurrence on/after referenceDate across every block, respecting
 * the date range. Scans day-by-day up to a year out rather than solving the
 * day-of-week arithmetic directly — recurrences are always a handful of
 * blocks, so this stays cheap and keeps the range-bound check in one place.
 */
export function getNextOccurrence(
  blocks: MeetingBlock[],
  referenceDate: Date,
  rangeStart: string | null,
  rangeEnd: string | null,
): { date: Date; startMinutes: number; endMinutes: number } | null {
  if (blocks.length === 0) return null;

  const MAX_DAYS_AHEAD = 366;
  const cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();

  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset++) {
    const day = new Date(cursor);
    day.setDate(day.getDate() + offset);
    if (!isWithinRange(toDateOnly(day), rangeStart, rangeEnd)) continue;

    const dayOfWeek = day.getDay();
    const candidates = blocks
      .filter((block) => block.days.includes(dayOfWeek))
      .filter((block) => offset > 0 || block.startMinutes >= nowMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    if (candidates.length > 0) {
      return { date: day, startMinutes: candidates[0].startMinutes, endMinutes: candidates[0].endMinutes };
    }
  }
  return null;
}

/** "Every Monday and Wednesday, from 9:00 AM to 10:15 AM." — one sentence per block, joined. Empty array -> "No recurrence configured yet." */
export function formatBlocksSummary(blocks: MeetingBlock[]): string {
  if (blocks.length === 0) return "No recurrence configured yet.";

  return blocks
    .map((block) => {
      const sortedDays = [...block.days].sort((a, b) => a - b).map((day) => DAY_NAMES[day]);
      const dayList =
        sortedDays.length <= 1
          ? sortedDays.join("")
          : `${sortedDays.slice(0, -1).join(", ")} and ${sortedDays[sortedDays.length - 1]}`;
      return `Every ${dayList}, from ${formatMinutesOfDay(block.startMinutes)} to ${formatMinutesOfDay(block.endMinutes)}.`;
    })
    .join(" ");
}
