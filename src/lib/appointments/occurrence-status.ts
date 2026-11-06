import type { AppointmentRow, EventStatus } from "@/lib/api/entity-types";
import { getNextResolvedOccurrence } from "@/lib/calendar/occurrence-overrides";

/** Narrower than a full AppointmentRow — the fields resolveDisplayedEventStatus actually needs, same convention as conflicts.ts's ConflictCheckableAppointment. */
type StatusResolvableAppointment = Pick<
  AppointmentRow,
  "id" | "event_status" | "meeting_blocks" | "recurrence_start_date" | "recurrence_end_date" | "occurrence_overrides"
>;

/**
 * The series date ("YYYY-MM-DD") of the occurrence a recurring appointment
 * currently shows — the key its done/missed status is filed under. It honours
 * per-date exceptions (a cancelled occurrence is skipped; a moved one is the
 * next one when its NEW time is) but always answers with the date the SERIES
 * puts the occurrence on, never where it was moved, so the status survives a
 * move. Null for a non-recurring appointment or a series with nothing left.
 * Every read and write of an occurrence's status must resolve it this way.
 */
export function getRelevantOccurrenceKey(appointment: StatusResolvableAppointment, now: Date): string | null {
  return getNextResolvedOccurrence(appointment, now)?.originalDate ?? null;
}

/**
 * Builds the composite key used to look up/store one appointment
 * occurrence's status, consistently across every read (this file) and write
 * (the transition route) call site.
 */
export function occurrenceStatusMapKey(appointmentId: string, occurrenceDate: string): string {
  return `${appointmentId}:${occurrenceDate}`;
}

/**
 * Flattens the `appointment_occurrence_status(occurrence_date, status)`
 * relation GET /api/appointments embeds on each row
 * (supabase/migrations/0049_appointment_occurrence_status.sql) into one
 * lookup map, built once per list rather than re-flattened per row.
 */
export function buildOccurrenceStatusMap(
  appointments: Array<Pick<AppointmentRow, "id" | "appointment_occurrence_status">>,
): Map<string, EventStatus> {
  const map = new Map<string, EventStatus>();
  for (const appointment of appointments) {
    for (const row of appointment.appointment_occurrence_status ?? []) {
      map.set(occurrenceStatusMapKey(appointment.id, row.occurrence_date), row.status);
    }
  }
  return map;
}

/**
 * The single source of truth for "what status should this appointment show
 * right now" — every read call site (dashboard Up Next, the calendar
 * timeline, the transition buttons' gating) goes through this instead of
 * reading `appointment.event_status` directly.
 *
 * Non-recurring (meeting_blocks empty): appointments.event_status is
 * authoritative, returned unchanged — zero behavior change from before this
 * table existed.
 *
 * Recurring: appointment.event_status is NEVER consulted. It's forced to
 * 'planned' once at creation and never updated again for a recurring row —
 * per-occurrence completions live in appointment_occurrence_status instead
 * (the write path, Phase 3, upserts there). The relevant occurrence (the one
 * getNextOccurrence resolves as current for `now`) is looked up in
 * `occurrenceStatusByKey`; no row for it means nobody has completed/missed
 * that occurrence yet, which defaults to 'planned'. No next occurrence at
 * all (recurrence_end_date has passed) means there's nothing left to
 * display — callers that need to skip the item entirely in that case check
 * for `null` themselves (they typically already called getNextOccurrence for
 * their own purposes and can just skip before ever calling this).
 */
export function resolveDisplayedEventStatus(
  appointment: StatusResolvableAppointment,
  occurrenceStatusByKey: Map<string, EventStatus>,
  now: Date,
): EventStatus | null {
  if (appointment.meeting_blocks.length === 0) {
    return appointment.event_status;
  }

  const occurrenceDateKey = getRelevantOccurrenceKey(appointment, now);
  if (!occurrenceDateKey) return null;

  return occurrenceStatusByKey.get(occurrenceStatusMapKey(appointment.id, occurrenceDateKey)) ?? "planned";
}
