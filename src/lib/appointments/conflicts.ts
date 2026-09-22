import type { AppointmentRow } from "@/lib/api/entity-types";
import { parseTimeToMinutes } from "@/lib/calendar/recurrence";

/** Narrower than a full AppointmentRow so callers that select only a subset of columns (e.g. the voice schedule loader) can pass their query results directly. */
type ConflictCheckableAppointment = Pick<AppointmentRow, "id" | "date" | "time" | "duration_minutes">;

/**
 * Flags appointment ids whose [start, start+duration) time range overlaps
 * another appointment's on the same calendar day. Only appointments with a
 * parseable structured time AND a duration_minutes are comparable — a Session
 * with a free-text time (or any appointment missing a duration) is silently
 * skipped rather than flagged, since there's nothing real to compare it
 * against. Touching endpoints (one ending exactly when another starts) are
 * NOT a conflict — back-to-back is normal scheduling, not double-booking.
 */
export function findConflictingAppointmentIds(appointments: ConflictCheckableAppointment[]): Set<string> {
  const byDate = new Map<string, Array<{ id: string; start: number; end: number }>>();

  for (const appointment of appointments) {
    const start = parseTimeToMinutes(appointment.time);
    if (start === null || !appointment.duration_minutes) continue;
    const interval = { id: appointment.id, start, end: start + appointment.duration_minutes };
    const bucket = byDate.get(appointment.date);
    if (bucket) {
      bucket.push(interval);
    } else {
      byDate.set(appointment.date, [interval]);
    }
  }

  const conflictIds = new Set<string>();
  for (const intervals of byDate.values()) {
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const a = intervals[i];
        const b = intervals[j];
        if (a.start < b.end && b.start < a.end) {
          conflictIds.add(a.id);
          conflictIds.add(b.id);
        }
      }
    }
  }
  return conflictIds;
}
