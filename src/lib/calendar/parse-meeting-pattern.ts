/**
 * `meeting_pattern` is unstructured free text (courses.meeting_pattern) —
 * there's no schema constraining it beyond "non-empty string". This is a
 * best-effort parser for the common academic-schedule notations, not a
 * general-purpose grammar. Anything outside the documented subset below
 * returns `null` rather than guessing — callers must fall back to a plain
 * text badge, never throw.
 *
 * Supported day notation:
 *  - Compact letter codes, no separator, case-insensitive: M T W R F S U
 *    where R = Thursday and U = Sunday (the standard registrar convention),
 *    PLUS the colloquial two-letter forms Th/Su/Sa/Tu mixed into the same
 *    run — so "MWF", "TR", "TTh", and "MTuWThF" all resolve correctly.
 *  - Separated day names/abbreviations (3+ letters), split on whitespace,
 *    commas, or slashes: "Mon/Wed/Fri", "Tue, Thu", "Monday".
 *
 * Supported time notation: `<start>-<end>` with optional `:MM` and optional
 * `am`/`pm` on either side (`10:00-10:50`, `9-9:50am`, `2:00pm-3:15pm`,
 * `14:00-15:15`). A meridiem on only the end time is inferred backward onto
 * the start time (`9-9:50am` -> both AM) — not the reverse, since "start
 * only" is rare in practice.
 *
 * NOT supported (documented gap, not a bug): a single letter/word with no
 * recognizable day token (e.g. bare "Th" with no other days), ranges without
 * a dash, multiple time ranges in one string, and anything that isn't
 * `<days> <start>-<end>` in that order.
 */

export interface ParsedMeetingPattern {
  /** 0=Sunday..6=Saturday, matching Date.prototype.getDay(). */
  days: number[];
  startMinutes: number;
  endMinutes: number;
}

const COMPACT_DAY_MAP: Record<string, number> = {
  U: 0,
  M: 1,
  T: 2,
  W: 3,
  R: 4,
  F: 5,
  S: 6,
};

const WORD_DAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function dedupeSorted(days: number[]): number[] {
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

/** "MWF" / "TR" / "TTh" / "mtwrf" — a run of single-letter codes with a few two-letter colloquial forms mixed in. */
function parseCompactDays(token: string): number[] | null {
  const days: number[] = [];
  let index = 0;
  while (index < token.length) {
    const two = token.slice(index, index + 2).toLowerCase();
    if (two === "th") {
      days.push(4);
      index += 2;
      continue;
    }
    if (two === "su") {
      days.push(0);
      index += 2;
      continue;
    }
    if (two === "sa") {
      days.push(6);
      index += 2;
      continue;
    }
    if (two === "tu") {
      days.push(2);
      index += 2;
      continue;
    }
    const day = COMPACT_DAY_MAP[token[index].toUpperCase()];
    if (day === undefined) return null;
    days.push(day);
    index += 1;
  }
  return days.length > 0 ? dedupeSorted(days) : null;
}

/** "Mon/Wed/Fri", "Tue, Thu", "Monday" — day names separated by whitespace, commas, or slashes. */
function parseWordDays(token: string): number[] | null {
  const parts = token.split(/[\s,/]+/).filter(Boolean);
  const days = parts.map((part) => WORD_DAY_MAP[part.toLowerCase()]);
  if (days.length === 0 || days.some((day) => day === undefined)) return null;
  return dedupeSorted(days);
}

function parseDays(token: string): number[] | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  if (/[\s,/]/.test(trimmed)) return parseWordDays(trimmed);

  // Check the word-day table before falling through to compact parsing —
  // a shape check alone (3+ letters) would wrongly match "MWF"/"TTh" too,
  // since they're also 3-letter alphabetic strings.
  const asWord = WORD_DAY_MAP[trimmed.toLowerCase()];
  if (asWord !== undefined) return [asWord];

  return parseCompactDays(trimmed);
}

function parseClock(raw: string, inferredMeridiem?: "am" | "pm"): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = (match[3]?.toLowerCase() as "am" | "pm" | undefined) ?? inferredMeridiem;

  if (hour > 23 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

// Day token is `.+?` (lazy), not `\S+` — a comma+space list like "Tue, Thu"
// has an internal space, so a non-whitespace-only token would only ever
// capture "Tue," and leave "Thu" dangling.
const PATTERN_RE = /^(.+?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i;

export function parseMeetingPattern(pattern: string): ParsedMeetingPattern | null {
  const match = PATTERN_RE.exec(pattern.trim());
  if (!match) return null;

  const [, dayToken, startRaw, endRaw] = match;
  const days = parseDays(dayToken);
  if (!days) return null;

  const endMeridiemMatch = /\b(am|pm)\b/i.exec(endRaw);
  const endMeridiem = endMeridiemMatch ? (endMeridiemMatch[1].toLowerCase() as "am" | "pm") : undefined;

  const startMinutes = parseClock(startRaw, endMeridiem);
  const endMinutes = parseClock(endRaw);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;

  return { days, startMinutes, endMinutes };
}

/** "630" -> "10:30 AM" for hour-axis labels and event tooltips. */
export function formatMinutesOfDay(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${meridiem}` : `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}
