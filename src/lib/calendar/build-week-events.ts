import { expandBlockInWeek, formatMinutesOfDay } from "@/lib/calendar/recurrence";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE, type StatusTone } from "@/lib/status-colors";
import type { CourseRow, DeadlineRow, TaskRow, PersonRow, AppointmentRow } from "@/lib/api/entity-types";

export interface CalendarEvent {
  id: string;
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

/** "14:00" / "14:00:00" -> 840. Returns null for a missing or unparseable time so the caller can skip that row. */
function parseTimeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Composes the current week's grid from already-fetched Courses (recurring
 * meeting_blocks, each expanded to this week's matching weekdays and bounded
 * by recurrence_start_date/recurrence_end_date), Deadlines (single-day
 * markers on due_at), open Tasks with a due_at (single-day markers, same
 * treatment as Deadlines), and Appointments with a structured time (blocks
 * sized by duration_minutes, same treatment as Course occurrences) — only
 * those falling within the displayed week. Deadline Sessions (appointments
 * rows tagged category "Session") are excluded — they're managed through
 * their own dedicated flow (SessionsSection/SessionForm on a Deadline's
 * page) and have no person_id (the People feature doesn't apply to them),
 * unlike every other row here. A tracked person's Deadline is also always
 * excluded, regardless of any PersonFilterToggle selection a caller applies
 * to courses/tasks — matches Voice Assistant's get_person_schedule, which
 * never returns a tracked person's Deadlines either (Courses/Tasks only).
 * People (tracked schedules — see supabase/migrations/0013_people.sql)
 * supplies the personId -> name/color lookup used to color-code and label
 * events that belong to someone other than the account owner. No
 * `/api/calendar` route exists — this is client-side composition, same
 * pattern as the Dashboard.
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
): WeekGridData {
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const personById = new Map(people.map((person) => [person.id, person]));
  function personInfo(personId: string | null): { personId: string | null; personLabel: string; color?: string } {
    if (!personId) return { personId: null, personLabel: "Me" };
    const person = personById.get(personId);
    return { personId, personLabel: person?.name ?? "Unknown", color: person?.color };
  }

  // blockIndex disambiguates the id when two blocks on the same course land
  // on the same weekday (e.g. a lecture block and a separately-configured
  // lab block that both happen to include Monday).
  interface CourseOccurrence {
    course: CourseRow;
    blockIndex: number;
    dayOfWeek: number;
    startMinutes: number;
    endMinutes: number;
  }
  const courseOccurrences: CourseOccurrence[] = [];
  for (const course of courses) {
    course.meeting_blocks.forEach((block, blockIndex) => {
      for (const occurrence of expandBlockInWeek(block, weekStart, weekEnd, course.recurrence_start_date, course.recurrence_end_date)) {
        courseOccurrences.push({
          course,
          blockIndex,
          dayOfWeek: occurrence.dayOfWeek,
          startMinutes: occurrence.startMinutes,
          endMinutes: occurrence.endMinutes,
        });
      }
    });
  }

  const weekDeadlines = deadlines.filter((deadline) => {
    if (!isOpenDeadline(deadline.status)) return false;
    // A tracked person's Deadline never renders on the calendar (People
    // feature) — matches Voice Assistant's get_person_schedule, which only
    // ever returns a tracked person's Courses/Tasks. This holds regardless
    // of PersonFilterToggle state, and also keeps a tracked person's
    // deadline from silently stretching windowStart/windowEnd below.
    if (deadline.person_id !== null) return false;
    const dueAt = new Date(deadline.due_at);
    return dueAt >= weekStart && dueAt < weekEnd;
  });

  const weekTasks = tasks.filter((task) => {
    if (!isOpenTask(task.status) || !task.due_at) return false;
    const dueAt = new Date(task.due_at);
    return dueAt >= weekStart && dueAt < weekEnd;
  });

  const weekAppointments = appointments.filter((appointment) => {
    if (appointment.category === "Session") return false;
    const appointmentDate = new Date(`${appointment.date}T00:00:00`);
    return appointmentDate >= weekStart && appointmentDate < weekEnd;
  });

  let windowStart = DEFAULT_WINDOW_START;
  let windowEnd = DEFAULT_WINDOW_END;
  for (const occurrence of courseOccurrences) {
    windowStart = Math.min(windowStart, occurrence.startMinutes);
    windowEnd = Math.max(windowEnd, occurrence.endMinutes);
  }
  for (const deadline of weekDeadlines) {
    const dueAt = new Date(deadline.due_at);
    const minutesOfDay = dueAt.getHours() * 60 + dueAt.getMinutes();
    windowStart = Math.min(windowStart, minutesOfDay);
    windowEnd = Math.max(windowEnd, minutesOfDay + DEADLINE_MARKER_MINUTES);
  }
  for (const task of weekTasks) {
    const dueAt = new Date(task.due_at as string);
    const minutesOfDay = dueAt.getHours() * 60 + dueAt.getMinutes();
    windowStart = Math.min(windowStart, minutesOfDay);
    windowEnd = Math.max(windowEnd, minutesOfDay + TASK_MARKER_MINUTES);
  }
  for (const appointment of weekAppointments) {
    const minutesOfDay = parseTimeToMinutes(appointment.time);
    if (minutesOfDay === null) continue;
    const durationMinutes = appointment.duration_minutes ?? APPOINTMENT_MARKER_MINUTES;
    windowStart = Math.min(windowStart, minutesOfDay);
    windowEnd = Math.max(windowEnd, minutesOfDay + durationMinutes);
  }
  windowStart = Math.max(0, Math.floor((windowStart - WINDOW_PADDING) / HOUR) * HOUR);
  windowEnd = Math.min(24 * HOUR, Math.ceil((windowEnd + WINDOW_PADDING) / HOUR) * HOUR);
  if (windowEnd - windowStart < MIN_WINDOW_SPAN) windowEnd = Math.min(24 * HOUR, windowStart + MIN_WINDOW_SPAN);

  const days: DayColumn[] = DAY_LABELS.map((label, dayOfWeek) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOfWeek);
    const events: CalendarEvent[] = [];

    for (const occurrence of courseOccurrences) {
      if (occurrence.dayOfWeek !== dayOfWeek) continue;
      events.push({
        id: `course-${occurrence.course.id}-${occurrence.blockIndex}-${dayOfWeek}`,
        title: occurrence.course.name,
        timeLabel: `${formatMinutesOfDay(occurrence.startMinutes)}–${formatMinutesOfDay(occurrence.endMinutes)}`,
        subtitle: occurrence.course.location ?? "—",
        startMinutes: occurrence.startMinutes,
        endMinutes: occurrence.endMinutes,
        tone: "accent",
        href: `/courses/${occurrence.course.id}`,
        ...personInfo(occurrence.course.person_id),
      });
    }

    for (const deadline of weekDeadlines) {
      const dueAt = new Date(deadline.due_at);
      if (!sameDay(dueAt, date)) continue;
      const minutesOfDay = dueAt.getHours() * 60 + dueAt.getMinutes();
      events.push({
        id: `deadline-${deadline.id}`,
        title: deadline.title,
        timeLabel: formatMinutesOfDay(minutesOfDay),
        subtitle: "Deadline",
        startMinutes: minutesOfDay,
        endMinutes: minutesOfDay + DEADLINE_MARKER_MINUTES,
        tone: DEADLINE_STATUS_TONE[deadline.status],
        href: `/courses/deadlines/${deadline.id}`,
        ...personInfo(deadline.person_id),
      });
    }

    for (const task of weekTasks) {
      const dueAt = new Date(task.due_at as string);
      if (!sameDay(dueAt, date)) continue;
      const minutesOfDay = dueAt.getHours() * 60 + dueAt.getMinutes();
      events.push({
        id: `task-${task.id}`,
        title: task.title,
        timeLabel: formatMinutesOfDay(minutesOfDay),
        subtitle: "Task",
        startMinutes: minutesOfDay,
        endMinutes: minutesOfDay + TASK_MARKER_MINUTES,
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

    return {
      key: String(dayOfWeek),
      dayOfWeek,
      label: `${label} ${date.getDate()}`,
      isToday: sameDay(date, today),
      events,
    };
  });

  const hourMarks: number[] = [];
  for (let minute = windowStart; minute <= windowEnd; minute += HOUR) hourMarks.push(minute);

  return { days, hourMarks, windowStart, windowEnd };
}
