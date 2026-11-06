import type { CalendarEvent } from "@/lib/calendar/build-week-events";
import type { EventTimes } from "@/lib/calendar/drag-math";
import { zonedPartsToIso } from "@/lib/format/zoned-datetime";

/** The kinds of calendar block a drag/resize/dialog can write directly (recurring ones need occurrence overrides — a later phase). */
export type EditableKind = "appointment" | "deadline" | "task";

/** A calendar change expressed as the PATCH it becomes. */
export interface CalendarEdit {
  kind: EditableKind;
  /** The appointment / deadline / task row id. */
  id: string;
  /** The request body for PATCH /api/{appointments|deadlines|tasks}/{id}. */
  body: Record<string, string | number>;
  /** The new due instant for a deadline/task; null for an appointment. */
  dueAt: string | null;
  /** A recurring deadline's "All occurrences": POST /api/deadlines/{id}/series-shift instead of the plain PATCH, so the schedule follows. */
  series?: boolean;
}

/** Minutes-of-day as the zero-padded 24-hour "HH:MM" appointments store (what <input type="time"> writes and parseTimeToMinutes reads). */
export function minutesToTimeKey(minutes: number): string {
  const inDay = Math.min(Math.max(Math.round(minutes), 0), 24 * 60 - 1);
  return `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
}

/**
 * Turns "this block now sits at `times`" into the PATCH that makes it so; null
 * for a kind the calendar can't write directly (or an unrepresentable time).
 * An appointment keeps its date + time + duration; a deadline/task is a point
 * in time, so only the start matters and it is written as an instant in the
 * profile time zone (the zone due dates are shown in).
 */
export function buildCalendarEdit(event: Pick<CalendarEvent, "kind" | "entityId">, times: EventTimes, timeZone: string): CalendarEdit | null {
  if (event.kind === "appointment") {
    return {
      kind: "appointment",
      id: event.entityId,
      body: { date: times.date, time: minutesToTimeKey(times.startMinutes), duration_minutes: times.endMinutes - times.startMinutes },
      dueAt: null,
    };
  }
  if (event.kind === "deadline" || event.kind === "task") {
    const dueAt = zonedPartsToIso(times.date, minutesToTimeKey(times.startMinutes), timeZone);
    if (!dueAt) return null;
    return { kind: event.kind, id: event.entityId, body: { due_at: dueAt }, dueAt };
  }
  return null;
}

/**
 * True when a deadline/task would be set before `now`. That makes it overdue
 * at once (and, for a deadline, can trigger the recurring-deadline roll-over),
 * so the caller asks first. A one-off appointment can freely sit in the past.
 */
export function isMoveIntoPast(edit: CalendarEdit, now: Date): boolean {
  return edit.dueAt !== null && new Date(edit.dueAt).getTime() < now.getTime();
}
