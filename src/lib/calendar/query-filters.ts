/**
 * The exact list filters the calendar fetches with. Module-level constants so
 * the query keys are stable — and shared, so a calendar edit can patch the very
 * cache entries the grid renders from (see useApplyCalendarEdit).
 *
 * Courses, deadlines and tasks read the largest page the API serves (100); the
 * default of 20 silently dropped everything past the 20th row.
 */
export const CALENDAR_LIST_FILTERS = { limit: 100 } as const;

/** Same value-equal filters AppointmentsTimeline fetches with, so TanStack Query dedupes them into one cache entry. */
export const CALENDAR_APPOINTMENT_FILTERS = { limit: 100 } as const;
