import { parseTimeToMinutes } from "@/lib/calendar/recurrence";
import type { AppointmentRow } from "@/lib/api/entity-types";

/** "Mon, Sep 14" — shared by the list row and the search haystack so what a user sees is what they can search. */
export function formatAppointmentDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whether an appointment is fully over as of `now` (browser-local time, the
 * same clock formatAppointmentDate displays in).
 *
 * - One-off with a structured "HH:MM" time: over once start + duration has
 *   elapsed (a missing duration ends at its start). An in-progress event is
 *   not past.
 * - One-off with no time or a free-text time (Deadline-Session style): there
 *   is no real end to compare against, so it stays upcoming until its day
 *   is over.
 * - Recurring (meeting_blocks): past only once recurrence_end_date is before
 *   today. An open-ended recurrence is never past.
 */
export function isPastAppointment(appointment: AppointmentRow, now: Date): boolean {
  if (appointment.meeting_blocks.length > 0) {
    return appointment.recurrence_end_date !== null && appointment.recurrence_end_date < toDateKey(now);
  }

  const [year, month, day] = appointment.date.split("-").map(Number);
  const startMinutes = parseTimeToMinutes(appointment.time);
  const endMinutes = startMinutes === null ? 24 * 60 : startMinutes + (appointment.duration_minutes ?? 0);
  // Date normalizes minute overflow (e.g. 1440 -> next midnight) for us.
  const end = new Date(year, month - 1, day, 0, endMinutes);
  return end.getTime() <= now.getTime();
}

/**
 * Keyword filter for the list's search box. The query is split on whitespace
 * and EVERY token must appear (case-insensitive substring) somewhere in the
 * title, category, location, status, or the date as displayed / as ISO —
 * so "career webinar" and "webinar career" behave the same and "sep 21"
 * finds that day. An empty query matches everything.
 */
export function matchesSearch(appointment: AppointmentRow, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = [
    appointment.title,
    appointment.category,
    appointment.location,
    appointment.event_status,
    appointment.date,
    formatAppointmentDate(appointment.date),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

export interface Page<T> {
  items: T[];
  /** 1-based, clamped into [1, totalPages]. */
  page: number;
  totalPages: number;
  total: number;
  /** 1-based inclusive range of `total` shown on this page; 0/0 when empty. */
  rangeStart: number;
  rangeEnd: number;
}

/** Slices one page out of an already-filtered list. An out-of-range `page` is clamped, so callers never need an effect to "fix" it after a delete/filter change. */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    totalPages,
    total,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: start + slice.length,
  };
}
