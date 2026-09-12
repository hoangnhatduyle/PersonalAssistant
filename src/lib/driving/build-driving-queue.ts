import type { AppointmentRow, DeadlineRow, PersonRow, TaskRow } from "@/lib/api/entity-types";
import { buildUpcomingItems, filterUpcomingItemsByTimeWindow, type UpcomingItem, type UpcomingItemKind } from "@/lib/dashboard/upcoming-items";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";

export type DrivingItemKind = UpcomingItemKind | "event";

export interface DrivingQueueItem extends Omit<UpcomingItem, "kind"> {
  kind: DrivingItemKind;
}

interface BuildDrivingQueueInput {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  appointments?: AppointmentRow[];
  /** Tracked People (People feature) — for labeling a Task that belongs to someone other than the account owner. */
  people?: PersonRow[];
  /** Today's DayColumn.events from buildWeekGridData -- minutes-of-day, converted below against referenceDate's calendar day. */
  todayCalendarEvents?: CalendarEvent[];
  referenceDate?: Date;
}

/**
 * `CalendarEvent.startMinutes` is minutes-of-day, not an absolute instant --
 * there's no existing helper for this exact conversion because
 * build-week-events.ts never needs one (it renders events within their own
 * day column). Anchored to referenceDate's calendar day since the caller
 * only ever passes the "isToday" DayColumn's events.
 */
function calendarEventToDrivingItem(event: CalendarEvent, referenceDate: Date): DrivingQueueItem {
  const at = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  at.setMinutes(event.startMinutes);
  return {
    id: event.id,
    kind: "event",
    title: event.title,
    at,
    href: event.href,
    urgent: false,
  };
}

/**
 * Driving Mode's single merged, today-scoped queue: reuses
 * buildUpcomingItems (deadlines/tasks/sessions) unchanged, and folds in
 * today's calendar meeting-block occurrences, which buildUpcomingItems never
 * covers. Re-sorted chronologically across both sources.
 */
export function buildDrivingQueue({
  deadlines,
  tasks,
  appointments = [],
  people = [],
  todayCalendarEvents = [],
  referenceDate = new Date(),
}: BuildDrivingQueueInput): DrivingQueueItem[] {
  const upcoming = filterUpcomingItemsByTimeWindow(
    buildUpcomingItems({ deadlines, tasks, appointments, people }),
    "today",
    referenceDate,
  );
  const events = todayCalendarEvents.map((event) => calendarEventToDrivingItem(event, referenceDate));

  return [...upcoming, ...events].sort((a, b) => a.at.getTime() - b.at.getTime());
}
