import { formatMinutesOfDay, parseTimeToMinutes } from "@/lib/calendar/recurrence";
import { resolveOccurrencesInWeek, type ResolvedOccurrence } from "@/lib/calendar/occurrence-overrides";
import { isoToZonedParts, todayInZone } from "@/lib/format/zoned-datetime";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE, type StatusTone } from "@/lib/status-colors";
import type { CourseRow, DeadlineRow, TaskRow, PersonRow, AppointmentRow } from "@/lib/api/entity-types";

/** Which occurrence of a recurring course/appointment a block is: where the weekly series puts it, and whether an exception has changed it. */
export interface RecurringOccurrenceRef {
  /** The series' own date for this occurrence — the key an exception and (for appointments) its done/missed status are filed under. */
  originalDate: string;
  originalStartMinutes: number;
  /** True when a per-date exception moved, resized or otherwise changed it. */
  isOverridden: boolean;
}

/** What a calendar block is — decides how an edit to it is written (see src/hooks/useCalendarEventEdit.ts). */
export type CalendarEventKind = "course" | "recurring-appointment" | "appointment" | "deadline" | "task";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  /** The course / appointment / deadline / task row this block belongs to. */
  entityId: string;
  /** YYYY-MM-DD of the column this block sits on — for a recurring item, the date of this occurrence. */
  occurrenceDate: string;
  /** Index into the parent's meeting_blocks for a recurring occurrence; null for everything else. */
  blockIndex: number | null;
  /** For a recurring course/appointment occurrence, which one of the series it is; null for everything else. */
  occurrence: RecurringOccurrenceRef | null;
  /** Whether the calendar may change it directly. False for a tracked person's events and (until occurrence overrides exist) recurring ones. */
  editable: boolean;
  title: string;
  /** The meeting's start–end time range (e.g. "12:30–1:50 PM") or a due-time marker. */
  timeLabel: string;
  /** Course location, or a Deadline/Task label for non-course markers. */
  subtitle: string;
  startMinutes: number;
  endMinutes: number;
  tone: StatusTone;
  href: string;
  /** null for the account owner's own event; a People row's id otherwise (People feature). */
  personId: string | null;
  /** "Me" when personId is null, else that Person's name. */
  personLabel: string;
  /** Set only for a tracked Person's event — takes rendering priority over `tone` (see EventBlock). */
  color?: string;
}

export interface DayColumn {
  key: string;
  dayOfWeek: number;
  /** This column's calendar date as YYYY-MM-DD (same convention as AppointmentPayload.date). */
  date: string;
  label: string;
  isToday: boolean;
  events: CalendarEvent[];
}

export interface WeekGridData {
  days: DayColumn[];
  hourMarks: number[];
  windowStart: number;
  windowEnd: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR = 60;
const DEFAULT_WINDOW_START = 8 * HOUR;
const DEFAULT_WINDOW_END = 18 * HOUR;
const MIN_WINDOW_SPAN = 8 * HOUR;
const WINDOW_PADDING = 30;
/** Deadlines/Tasks have no duration — give their marker a fixed visual height on the grid. */
const DEADLINE_MARKER_MINUTES = 45;
const TASK_MARKER_MINUTES = 45;
/** Fallback when an Appointment somehow has no duration_minutes — normal (non-Session) appointments always set one via AppointmentForm. */
const APPOINTMENT_MARKER_MINUTES = 45;

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Local YYYY-MM-DD (not `.toISOString()`, which converts to UTC and can shift the date in positive-offset timezones). */
function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const occurrenceRef = (occurrence: ResolvedOccurrence): RecurringOccurrenceRef => ({
  originalDate: occurrence.originalDate,
  originalStartMinutes: occurrence.originalStartMinutes,
  isOverridden: occurrence.isOverridden,
});

/**
 * `course-{id}-{block}-{weekday}` (or `appointment-…`) — stable and unchanged for an ordinary occurrence. A
 * changed one adds the series date it came from, since an occurrence moved onto a day can sit beside that day's own
 * occurrence of the same block and the ids must stay unique (they are React keys).
 */
function occurrenceEventId(prefix: "course" | "appointment", entityId: string, occurrence: ResolvedOccurrence, dayOfWeek: number): string {
  const base = `${prefix}-${entityId}-${occurrence.blockIndex}-${dayOfWeek}`;
  return occurrence.isOverridden ? `${base}-from-${occurrence.originalDate}` : base;
}

/** An instant's calendar date and minutes-of-day, in `timeZone` (the profile zone) or, when none is given, the device's. Null for an invalid value. */
function instantParts(iso: string, timeZone: string | undefined): { dateKey: string; minutes: number } | null {
  if (timeZone) {
    const parts = isoToZonedParts(iso, timeZone);
    if (!parts) return null;
    const [hours, minutes] = parts.time.split(":").map(Number);
    return { dateKey: parts.date, minutes: hours * HOUR + minutes };
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { dateKey: toDateKey(date), minutes: date.getHours() * HOUR + date.getMinutes() };
}

/**
 * Composes the current week's grid from already-fetched Courses (recurring
 * meeting_blocks, each expanded to this week's matching weekdays and bounded
 * by recurrence_start_date/recurrence_end_date), Deadlines (single-day
 * markers on due_at), open Tasks with a due_at (single-day markers, same
 * treatment as Deadlines), and Appointments — either single-date (a
 * structured time, sized by duration_minutes) or, since
 * supabase/migrations/0035_appointment_recurrence.sql, Course-style
 * recurring (meeting_blocks set, expanded exactly like a Course's) — only
 * those falling within the displayed week. Deadline Sessions (appointments
 * rows tagged category "Session") are excluded — they're managed through
 * their own dedicated flow (SessionsSection/SessionForm on a Deadline's
 * page) and have no person_id (the People feature doesn't apply to them),
 * unlike every other row here. A tracked person's Deadline is also always
 * excluded, regardless of any PersonFilterToggle selection a caller applies
 * to courses/tasks — matches Voice Assistant's get_person_schedule, which
 * never returns a tracked person's Deadlines either (Courses/Tasks only).
 * The account owner's own Courses take `ownerColor` when one is chosen;
 * People (tracked schedules — see supabase/migrations/0013_people.sql)
 * supplies the personId -> name/color lookup used to color-code and label
 * events that belong to someone other than the account owner. No
 * `/api/calendar` route exists — this is client-side composition, same
 * pattern as the Dashboard.
 *
 * Deadlines and Tasks are instants, so `timeZone` (the profile zone from
 * Settings) decides which day and time they sit on and which day is "today";
 * omitted, the device's zone is used. Recurring items and one-off
 * Appointments are zone-less wall-clock values and are unaffected.
 *
 * Every event carries structured fields (kind, entityId, occurrenceDate,
 * blockIndex, editable) so the calendar can edit it without parsing `id`.
 */
export function buildWeekGridData(
  courses: CourseRow[],
  deadlines: DeadlineRow[],
  tasks: TaskRow[] = [],
  people: PersonRow[] = [],
  referenceDate: Date = new Date(),
  appointments: AppointmentRow[] = [],
  // Separate from referenceDate (which week to show) so isToday stays
  // correct when the caller navigates to a week other than the current one.
  today: Date = new Date(),
  // The account owner's chosen color (user_preferences.owner_color). Applied
  // to the owner's own Courses only — their Deadlines/Tasks/Appointments keep
  // their per-type status tones. Null/omitted = never chosen: Courses keep
  // their default "accent" tone.
  ownerColor: string | null = null,
  timeZone?: string,
): WeekGridData {
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekDateKeys = DAY_LABELS.map((_, offset) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + offset);
    return toDateKey(day);
  });

  const personById = new Map(people.map((person) => [person.id, person]));
  function personInfo(personId: string | null): { personId: string | null; personLabel: string; color?: string } {
    if (!personId) return { personId: null, personLabel: "Me" };
    const person = personById.get(personId);
    return { personId, personLabel: person?.name ?? "Unknown", color: person?.color };
  }

  // Each recurring course/appointment is expanded through the occurrence resolver, which applies its
  // per-date exceptions (cancelled / moved / resized) on top of the weekly pattern — see
  // src/lib/calendar/occurrence-overrides.ts. blockIndex (kept on every occurrence) disambiguates the id when two
  // blocks on the same course land on the same weekday (e.g. a lecture block and a separately-configured lab
  // block that both happen to include Monday).
  interface CourseOccurrence {
    course: CourseRow;
    occurrence: ResolvedOccurrence;
  }
  const courseOccurrences: CourseOccurrence[] = courses.flatMap((course) =>
    resolveOccurrencesInWeek(course, weekStart, weekEnd).map((occurrence) => ({ course, occurrence })),
  );

  // A tracked person's Deadline never renders on the calendar (People
  // feature) — matches Voice Assistant's get_person_schedule, which only
  // ever returns a tracked person's Courses/Tasks. This holds regardless
  // of PersonFilterToggle state, and also keeps a tracked person's
  // deadline from silently stretching windowStart/windowEnd below.
  const weekDeadlines = deadlines.flatMap((deadline) => {
    if (!isOpenDeadline(deadline.status) || deadline.person_id !== null) return [];
    const parts = instantParts(deadline.due_at, timeZone);
    return parts && weekDateKeys.includes(parts.dateKey) ? [{ deadline, parts }] : [];
  });

  const weekTasks = tasks.flatMap((task) => {
    if (!isOpenTask(task.status) || !task.due_at) return [];
    const parts = instantParts(task.due_at, timeZone);
    return parts && weekDateKeys.includes(parts.dateKey) ? [{ task, parts }] : [];
  });

  // Course-style recurrence (supabase/migrations/0035_appointment_recurrence.sql):
  // an appointment with meeting_blocks set recurs like a Course instead of
  // living on a single date — expanded the same way courseOccurrences is
  // above, through the same resolver (so it honours the same exceptions).
  interface AppointmentOccurrence {
    appointment: AppointmentRow;
    occurrence: ResolvedOccurrence;
  }
  const recurringAppointments = appointments.filter((appointment) => appointment.category !== "Session" && appointment.meeting_blocks.length > 0);
  const recurringAppointmentOccurrences: AppointmentOccurrence[] = recurringAppointments.flatMap((appointment) =>
    resolveOccurrencesInWeek(appointment, weekStart, weekEnd).map((occurrence) => ({ appointment, occurrence })),
  );

  const weekAppointments = appointments.filter((appointment) => {
    if (appointment.category === "Session" || appointment.meeting_blocks.length > 0) return false;
    const appointmentDate = new Date(`${appointment.date}T00:00:00`);
    return appointmentDate >= weekStart && appointmentDate < weekEnd;
  });

  let windowStart = DEFAULT_WINDOW_START;
  let windowEnd = DEFAULT_WINDOW_END;
  for (const { occurrence } of courseOccurrences) {
    windowStart = Math.min(windowStart, occurrence.startMinutes);
    windowEnd = Math.max(windowEnd, occurrence.endMinutes);
  }
  for (const { parts } of weekDeadlines) {
    windowStart = Math.min(windowStart, parts.minutes);
    windowEnd = Math.max(windowEnd, parts.minutes + DEADLINE_MARKER_MINUTES);
  }
  for (const { parts } of weekTasks) {
    windowStart = Math.min(windowStart, parts.minutes);
    windowEnd = Math.max(windowEnd, parts.minutes + TASK_MARKER_MINUTES);
  }
  for (const appointment of weekAppointments) {
    const minutesOfDay = parseTimeToMinutes(appointment.time);
    if (minutesOfDay === null) continue;
    const durationMinutes = appointment.duration_minutes ?? APPOINTMENT_MARKER_MINUTES;
    windowStart = Math.min(windowStart, minutesOfDay);
    windowEnd = Math.max(windowEnd, minutesOfDay + durationMinutes);
  }
  for (const { occurrence } of recurringAppointmentOccurrences) {
    windowStart = Math.min(windowStart, occurrence.startMinutes);
    windowEnd = Math.max(windowEnd, occurrence.endMinutes);
  }
  windowStart = Math.max(0, Math.floor((windowStart - WINDOW_PADDING) / HOUR) * HOUR);
  windowEnd = Math.min(24 * HOUR, Math.ceil((windowEnd + WINDOW_PADDING) / HOUR) * HOUR);
  if (windowEnd - windowStart < MIN_WINDOW_SPAN) windowEnd = Math.min(24 * HOUR, windowStart + MIN_WINDOW_SPAN);

  const days: DayColumn[] = DAY_LABELS.map((label, dayOfWeek) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOfWeek);
    const dateKey = toDateKey(date);
    const events: CalendarEvent[] = [];

    for (const { course, occurrence } of courseOccurrences) {
      if (occurrence.date !== dateKey) continue;
      events.push({
        id: occurrenceEventId("course", course.id, occurrence, dayOfWeek),
        kind: "course",
        entityId: course.id,
        occurrenceDate: dateKey,
        blockIndex: occurrence.blockIndex,
        occurrence: occurrenceRef(occurrence),
        editable: false,
        title: course.name,
        timeLabel: `${formatMinutesOfDay(occurrence.startMinutes)}–${formatMinutesOfDay(occurrence.endMinutes)}`,
        subtitle: course.location ?? "—",
        startMinutes: occurrence.startMinutes,
        endMinutes: occurrence.endMinutes,
        tone: "accent",
        href: `/courses/${course.id}`,
        ...personInfo(course.person_id),
        ...(course.person_id === null && ownerColor ? { color: ownerColor } : {}),
      });
    }

    for (const { deadline, parts } of weekDeadlines) {
      if (parts.dateKey !== dateKey) continue;
      events.push({
        id: `deadline-${deadline.id}`,
        kind: "deadline",
        occurrence: null,
        entityId: deadline.id,
        occurrenceDate: dateKey,
        blockIndex: null,
        editable: deadline.person_id === null,
        title: deadline.title,
        timeLabel: formatMinutesOfDay(parts.minutes),
        subtitle: "Deadline",
        startMinutes: parts.minutes,
        endMinutes: parts.minutes + DEADLINE_MARKER_MINUTES,
        tone: DEADLINE_STATUS_TONE[deadline.status],
        href: `/courses/deadlines/${deadline.id}`,
        ...personInfo(deadline.person_id),
      });
    }

    for (const { task, parts } of weekTasks) {
      if (parts.dateKey !== dateKey) continue;
      events.push({
        id: `task-${task.id}`,
        kind: "task",
        occurrence: null,
        entityId: task.id,
        occurrenceDate: dateKey,
        blockIndex: null,
        editable: task.person_id === null,
        title: task.title,
        timeLabel: formatMinutesOfDay(parts.minutes),
        subtitle: "Task",
        startMinutes: parts.minutes,
        endMinutes: parts.minutes + TASK_MARKER_MINUTES,
        tone: TASK_STATUS_TONE[task.status],
        href: `/board/${task.id}`,
        ...personInfo(task.person_id),
      });
    }

    for (const appointment of weekAppointments) {
      const appointmentDate = new Date(`${appointment.date}T00:00:00`);
      if (!sameDay(appointmentDate, date)) continue;
      const minutesOfDay = parseTimeToMinutes(appointment.time);
      if (minutesOfDay === null) continue;
      const durationMinutes = appointment.duration_minutes ?? APPOINTMENT_MARKER_MINUTES;
      events.push({
        id: `appointment-${appointment.id}`,
        kind: "appointment",
        occurrence: null,
        entityId: appointment.id,
        occurrenceDate: dateKey,
        blockIndex: null,
        editable: true,
        title: appointment.title,
        timeLabel: `${formatMinutesOfDay(minutesOfDay)}–${formatMinutesOfDay(minutesOfDay + durationMinutes)}`,
        subtitle: appointment.location ?? appointment.category,
        startMinutes: minutesOfDay,
        endMinutes: minutesOfDay + durationMinutes,
        tone: "warn",
        // No dedicated Appointment detail page — links back to this page's
        // own Appointments & Events Timeline panel (AppointmentsTimeline),
        // where it's actually editable.
        href: "/calendar#appointments-timeline",
        ...personInfo(null),
      });
    }

    for (const { appointment, occurrence } of recurringAppointmentOccurrences) {
      if (occurrence.date !== dateKey) continue;
      events.push({
        id: occurrenceEventId("appointment", appointment.id, occurrence, dayOfWeek),
        kind: "recurring-appointment",
        entityId: appointment.id,
        occurrenceDate: dateKey,
        blockIndex: occurrence.blockIndex,
        occurrence: occurrenceRef(occurrence),
        editable: false,
        title: appointment.title,
        timeLabel: `${formatMinutesOfDay(occurrence.startMinutes)}–${formatMinutesOfDay(occurrence.endMinutes)}`,
        subtitle: appointment.location ?? appointment.category,
        startMinutes: occurrence.startMinutes,
        endMinutes: occurrence.endMinutes,
        tone: "warn",
        href: "/calendar#appointments-timeline",
        ...personInfo(null),
      });
    }

    return {
      key: String(dayOfWeek),
      dayOfWeek,
      date: dateKey,
      label: `${label} ${date.getDate()}`,
      isToday: timeZone ? dateKey === todayInZone(timeZone, today) : sameDay(date, today),
      events,
    };
  });

  const hourMarks: number[] = [];
  for (let minute = windowStart; minute <= windowEnd; minute += HOUR) hourMarks.push(minute);

  return { days, hourMarks, windowStart, windowEnd };
}
