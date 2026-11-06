import { resolveOccurrencesOnDates, type RecurrenceSource } from "@/lib/calendar/occurrence-overrides";

export type ClassSource = RecurrenceSource & {
  name: string;
  code: string | null;
  location: string | null;
};

export interface TodaysClass {
  course: string;
  location: string | null;
  /** "H:MM" 24-hour, as the briefing prompt reads them. */
  start: string;
  end: string;
}

const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The classes that actually meet on `dateKey` ("YYYY-MM-DD"), for the daily
 * briefing: each course's weekly pattern within its recurrence range, with
 * per-date exceptions applied (a class cancelled today is left out, a
 * shortened one is reported by its new hours, one moved onto today is in).
 * Earliest first.
 */
export function buildTodaysClasses(courses: ClassSource[], dateKey: string): TodaysClass[] {
  return courses
    .flatMap((course) =>
      resolveOccurrencesOnDates(course, [dateKey]).map((occurrence) => ({
        startMinutes: occurrence.startMinutes,
        meeting: { course: course.code ?? course.name, location: course.location, start: clock(occurrence.startMinutes), end: clock(occurrence.endMinutes) },
      })),
    )
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .map(({ meeting }) => meeting);
}
