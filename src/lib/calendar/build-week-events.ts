import { parseMeetingPattern } from "@/lib/calendar/parse-meeting-pattern";
import { isOpenDeadline } from "@/lib/dashboard/upcoming-items";
import { DEADLINE_STATUS_TONE, type StatusTone } from "@/lib/status-colors";
import type { CourseRow, DeadlineRow } from "@/lib/api/entity-types";

export interface CalendarEvent {
  id: string;
  title: string;
  subtitle?: string;
  /** Percent (0-100) from the top of the day column. */
  top: number;
  /** Percent (0-100) of the day column's height. */
  height: number;
  tone: StatusTone;
  href: string;
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
  /** Courses whose meeting_pattern didn't match the supported grammar — render as a text badge, not on the grid. */
  unparsedCourses: CourseRow[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR = 60;
const DEFAULT_WINDOW_START = 8 * HOUR;
const DEFAULT_WINDOW_END = 18 * HOUR;
const MIN_WINDOW_SPAN = 8 * HOUR;
const WINDOW_PADDING = 30;
/** Deadlines have no duration — give the marker a fixed visual height on the grid. */
const DEADLINE_MARKER_MINUTES = 45;

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Composes the current week's grid from already-fetched Courses (recurring
 * blocks, parsed from meeting_pattern) and Deadlines (single-day markers on
 * due_at, only those falling within the displayed week). No `/api/calendar`
 * route exists — this is client-side composition, same pattern as the
 * Dashboard.
 */
export function buildWeekGridData(courses: CourseRow[], deadlines: DeadlineRow[], referenceDate: Date = new Date()): WeekGridData {
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  // referenceDate doubles as "today" — there's no week-navigation yet, so
  // the displayed week and "now" are always the same instant in practice.

  const parsedCourseBlocks: Array<{ course: CourseRow; days: number[]; startMinutes: number; endMinutes: number }> = [];
  const unparsedCourses: CourseRow[] = [];

  for (const course of courses) {
    if (!course.meeting_pattern) continue;
    const parsed = parseMeetingPattern(course.meeting_pattern);
    if (!parsed) {
      unparsedCourses.push(course);
      continue;
    }
    parsedCourseBlocks.push({ course, days: parsed.days, startMinutes: parsed.startMinutes, endMinutes: parsed.endMinutes });
  }

  const weekDeadlines = deadlines.filter((deadline) => {
    if (!isOpenDeadline(deadline.status)) return false;
    const dueAt = new Date(deadline.due_at);
    return dueAt >= weekStart && dueAt < weekEnd;
  });

  let windowStart = DEFAULT_WINDOW_START;
  let windowEnd = DEFAULT_WINDOW_END;
  for (const block of parsedCourseBlocks) {
    windowStart = Math.min(windowStart, block.startMinutes);
    windowEnd = Math.max(windowEnd, block.endMinutes);
  }
  for (const deadline of weekDeadlines) {
    const dueAt = new Date(deadline.due_at);
    const minutesOfDay = dueAt.getHours() * 60 + dueAt.getMinutes();
    windowStart = Math.min(windowStart, minutesOfDay);
    windowEnd = Math.max(windowEnd, minutesOfDay + DEADLINE_MARKER_MINUTES);
  }
  windowStart = Math.max(0, Math.floor((windowStart - WINDOW_PADDING) / HOUR) * HOUR);
  windowEnd = Math.min(24 * HOUR, Math.ceil((windowEnd + WINDOW_PADDING) / HOUR) * HOUR);
  if (windowEnd - windowStart < MIN_WINDOW_SPAN) windowEnd = Math.min(24 * HOUR, windowStart + MIN_WINDOW_SPAN);

  const span = windowEnd - windowStart;

  const days: DayColumn[] = DAY_LABELS.map((label, dayOfWeek) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOfWeek);
    const events: CalendarEvent[] = [];

    for (const block of parsedCourseBlocks) {
      if (!block.days.includes(dayOfWeek)) continue;
      events.push({
        id: `course-${block.course.id}-${dayOfWeek}`,
        title: block.course.name,
        subtitle: block.course.location ?? undefined,
        top: ((block.startMinutes - windowStart) / span) * 100,
        height: ((block.endMinutes - block.startMinutes) / span) * 100,
        tone: "accent",
        href: `/courses/${block.course.id}`,
      });
    }

    for (const deadline of weekDeadlines) {
      const dueAt = new Date(deadline.due_at);
      if (!sameDay(dueAt, date)) continue;
      const minutesOfDay = dueAt.getHours() * 60 + dueAt.getMinutes();
      events.push({
        id: `deadline-${deadline.id}`,
        title: deadline.title,
        subtitle: "Deadline",
        top: ((minutesOfDay - windowStart) / span) * 100,
        height: (DEADLINE_MARKER_MINUTES / span) * 100,
        tone: DEADLINE_STATUS_TONE[deadline.status],
        href: `/deadlines/${deadline.id}`,
      });
    }

    return {
      key: String(dayOfWeek),
      dayOfWeek,
      label: `${label} ${date.getDate()}`,
      isToday: sameDay(date, referenceDate),
      events,
    };
  });

  const hourMarks: number[] = [];
  for (let minute = windowStart; minute <= windowEnd; minute += HOUR) hourMarks.push(minute);

  return { days, hourMarks, windowStart, windowEnd, unparsedCourses };
}
