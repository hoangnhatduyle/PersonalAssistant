import type { AppointmentRow, CourseRow } from "@/lib/api/entity-types";
import { parseStructuredTime } from "@/lib/appointments/conflicts";
import { expandBlockForDateKeys } from "@/lib/calendar/recurrence";

type ConflictCheckableAppointment = Pick<AppointmentRow, "id" | "date" | "time" | "duration_minutes">;
type ConflictCheckableCourse = Pick<CourseRow, "meeting_blocks" | "recurrence_start_date" | "recurrence_end_date">;

/**
 * Flags appointment ids whose [start, start+duration) time range overlaps a
 * recurring Course meeting block on that exact calendar date — the user is
 * structurally in class and can't attend. Mirrors
 * findConflictingAppointmentIds's skip/comparison rules exactly (only a
 * structured time + duration is comparable; touching endpoints are not a
 * conflict), just against a Course's meeting_blocks instead of other
 * appointments.
 */
export function findCourseConflictingAppointmentIds(
  appointments: ConflictCheckableAppointment[],
  courses: ConflictCheckableCourse[],
): Set<string> {
  const conflictIds = new Set<string>();

  for (const appointment of appointments) {
    const start = parseStructuredTime(appointment.time);
    if (start === null || !appointment.duration_minutes) continue;
    const end = start + appointment.duration_minutes;

    for (const course of courses) {
      for (const block of course.meeting_blocks) {
        const occurrences = expandBlockForDateKeys(
          block,
          [appointment.date],
          course.recurrence_start_date,
          course.recurrence_end_date,
        );
        for (const occurrence of occurrences) {
          if (start < occurrence.endMinutes && occurrence.startMinutes < end) {
            conflictIds.add(appointment.id);
          }
        }
      }
    }
  }

  return conflictIds;
}
