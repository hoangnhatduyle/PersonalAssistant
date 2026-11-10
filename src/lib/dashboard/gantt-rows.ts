import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";
import { parseTimeToMinutes } from "@/lib/calendar/recurrence";
import type { ChecklistSummaryRow } from "@/lib/progress/checklist-summary";
import {
  resolveDeadlineProgress,
  resolveSessionProgress,
  resolveTaskProgress,
  type ProgressSource,
  type ResolvedProgress,
} from "@/lib/progress/resolve-progress";
import type { TimeWindowFilter, UpcomingItem } from "@/lib/dashboard/upcoming-items";

/** The three kinds of item that get a bar. Appointments and reminders are deliberately left out. */
export type GanttRowKind = "deadline" | "task" | "session";

export interface GanttRow {
  /** Unique across kinds (`deadline:<id>`), because a deadline and a task can never share a chart row id. */
  id: string;
  /** The underlying deadline / task / appointment id, for opening its dialog. */
  entityId: string;
  kind: GanttRowKind;
  title: string;
  /** Bar start as drawn -- clipped to the visible range, so it can be later than `actualStart`. */
  start: Date;
  end: Date;
  /** The true start (creation time for deadlines and tasks), shown in the tooltip when the bar is clipped. */
  actualStart: Date;
  clippedStart: boolean;
  /** 0-100, or null when no progress is known. */
  percent: number | null;
  source: ProgressSource;
  note: string | null;
  /** Past due and still open. Drawn in the overdue colour. */
  overdue: boolean;
  /** For a session, the row id of its deadline when that deadline is also shown. Sessions are listed straight after it. */
  parentId?: string;
}

export type GanttUnit = "day" | "week";

export interface GanttModel {
  rows: GanttRow[];
  /** Start of a local day. */
  rangeStart: Date;
  /** Start of a local day (exclusive): the chart's last column ends here. */
  rangeEnd: Date;
  unit: GanttUnit;
}

interface BuildGanttModelInput {
  /** Up Next's already time-window-filtered, ascending items. Only deadlines, tasks and sessions get rows. */
  items: UpcomingItem[];
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  /** Every appointment: a deadline's progress needs all of its sessions, shown or not. */
  appointments: AppointmentRow[];
  checklist: ChecklistSummaryRow[];
  window: TimeWindowFilter;
  now: Date;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** A 30-minute session in a day-wide column would be a 1px sliver, so every bar is drawn at least this wide. The tooltip carries the real length. */
const MIN_DRAWN_MS = 6 * HOUR_MS;
const DEFAULT_SESSION_MINUTES = 60;
/** A session with no time of day starts here, so it reads as a daytime block rather than midnight. */
const DEFAULT_SESSION_START_MINUTES = 9 * 60;
/** How far before today a window looks back; wider windows look further, up to a week. Kept short so the whole range fits a narrow card. */
const LOOKBACK_DAYS: Record<TimeWindowFilter, number> = { today: 2, tomorrow: 2, "3days": 3, "7days": 3, all: 7 };
/** Last day (as an offset from today) a window covers; "all" is computed from the data. */
const WINDOW_LAST_DAY: Record<Exclude<TimeWindowFilter, "all">, number> = { today: 0, tomorrow: 1, "3days": 2, "7days": 6 };
const ALL_MIN_DAYS_AHEAD = 6;
const ALL_MAX_DAYS_AHEAD = 59;
/** Past this many days the day columns get too narrow to read, so the chart switches to weeks. */
const WEEK_SCALE_MIN_SPAN_DAYS = 28;

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayOffset = (date: Date, todayStart: Date) => Math.round((startOfLocalDay(date).getTime() - todayStart.getTime()) / DAY_MS);
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

type RawRow = Omit<GanttRow, "start" | "clippedStart">;

function toRaw(
  kind: GanttRowKind,
  entityId: string,
  title: string,
  actualStart: Date,
  end: Date,
  progress: ResolvedProgress,
  overdue: boolean,
): RawRow {
  return { id: `${kind}:${entityId}`, entityId, kind, title, actualStart, end, percent: progress.percent, source: progress.source, note: progress.note, overdue };
}

function sessionStart(session: AppointmentRow): Date {
  const minutes = parseTimeToMinutes(session.time) ?? DEFAULT_SESSION_START_MINUTES;
  const [year, month, day] = session.date.split("-").map(Number);
  // Date normalizes minute overflow, so no string splicing (see upcoming-items.ts's dateAtMinutesOfDay).
  return new Date(year, month - 1, day, 0, minutes);
}

/**
 * Turns the filtered Up Next items into Gantt rows plus the chart's visible range and scale.
 *
 * - Deadlines and tasks run from creation to due; a session runs for its own duration.
 * - An overdue deadline/task runs on to now: it is late and still open, so the bar shows how long.
 * - A session is listed straight after its deadline when that deadline is also shown.
 * - Bars are clipped to the visible range (the true start is kept) and drawn at a minimum width.
 *
 * Pure: the caller supplies `now`.
 */
export function buildGanttModel({ items, deadlines, tasks, appointments, checklist, window, now }: BuildGanttModelInput): GanttModel {
  const deadlineById = new Map(deadlines.map((deadline) => [deadline.id, deadline]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const checklistByTaskId = new Map(checklist.map((row) => [row.task_id, { done: row.done, total: row.total }]));
  const sessionsOnly = appointments.filter((appointment) => appointment.category === "Session");

  // `dueAt` rides alongside each row (it only decides how far the "all" window reaches, so it is not part of GanttRow).
  const entries: Array<{ row: RawRow; dueAt: Date }> = [];
  for (const item of items) {
    if (item.kind === "deadline") {
      const deadline = deadlineById.get(item.id);
      if (!deadline) continue;
      const due = new Date(deadline.due_at);
      const end = item.urgent ? new Date(Math.max(due.getTime(), now.getTime())) : due;
      entries.push({ row: toRaw("deadline", deadline.id, deadline.title, new Date(deadline.created_at), end, resolveDeadlineProgress(deadline, sessionsOnly), item.urgent), dueAt: due });
    } else if (item.kind === "task") {
      const task = taskById.get(item.id);
      if (!task || !task.due_at) continue;
      const due = new Date(task.due_at);
      const end = item.urgent ? new Date(Math.max(due.getTime(), now.getTime())) : due;
      entries.push({ row: toRaw("task", task.id, task.title, new Date(task.created_at), end, resolveTaskProgress(task, checklistByTaskId.get(task.id)), item.urgent), dueAt: due });
    } else if (item.kind === "session") {
      const session = appointmentById.get(item.id);
      if (!session) continue;
      const start = sessionStart(session);
      const end = new Date(start.getTime() + (session.duration_minutes ?? DEFAULT_SESSION_MINUTES) * 60_000);
      const row = toRaw("session", session.id, session.title, start, end, resolveSessionProgress(session), item.urgent);
      if (session.deadline_id) row.parentId = `deadline:${session.deadline_id}`;
      entries.push({ row, dueAt: end });
    }
  }

  const todayStart = startOfLocalDay(now);

  // Range end: the window's last day plus one day of context, exclusive.
  const lastDay =
    window === "all"
      ? Math.min(ALL_MAX_DAYS_AHEAD, Math.max(ALL_MIN_DAYS_AHEAD, ...entries.map((entry) => dayOffset(entry.dueAt, todayStart))))
      : WINDOW_LAST_DAY[window];
  const rangeEnd = addDays(todayStart, lastDay + 2);

  // Range start: the earliest bar, but no further back than the window's lookback and at least one day before today.
  const lookbackFloor = addDays(todayStart, -LOOKBACK_DAYS[window]);
  const earliest = entries.length > 0 ? Math.min(...entries.map((entry) => entry.row.actualStart.getTime())) : todayStart.getTime();
  const rangeStart = new Date(Math.min(startOfLocalDay(new Date(Math.max(earliest, lookbackFloor.getTime()))).getTime(), addDays(todayStart, -1).getTime()));

  const rows: GanttRow[] = entries.map(({ row }) => {
    const clippedStart = row.actualStart.getTime() < rangeStart.getTime();
    const start = clippedStart ? rangeStart : row.actualStart;
    const end = new Date(Math.max(row.end.getTime(), start.getTime() + MIN_DRAWN_MS));
    return { ...row, start, end, clippedStart };
  });

  const spanDays = (rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS;
  return { rows: groupSessionsUnderDeadlines(rows), rangeStart, rangeEnd, unit: spanDays > WEEK_SCALE_MIN_SPAN_DAYS ? "week" : "day" };
}

/** Moves each session to just after its deadline's row (keeping their relative order); orphans stay where they were. */
function groupSessionsUnderDeadlines(rows: GanttRow[]): GanttRow[] {
  const shownIds = new Set(rows.map((row) => row.id));
  const childrenByParent = new Map<string, GanttRow[]>();
  const top: GanttRow[] = [];
  for (const row of rows) {
    if (row.parentId && shownIds.has(row.parentId)) {
      childrenByParent.set(row.parentId, [...(childrenByParent.get(row.parentId) ?? []), row]);
    } else {
      top.push({ ...row, parentId: undefined });
    }
  }
  return top.flatMap((row) => [row, ...(childrenByParent.get(row.id) ?? [])]);
}

const KIND_LABEL: Record<GanttRowKind, string> = { deadline: "Deadline", task: "Task", session: "Session" };

const SOURCE_PHRASE: Record<ProgressSource, string> = {
  manual: "set by you",
  "session-time": "from done sessions vs estimate",
  "session-count": "from done sessions",
  checklist: "from checklist",
  status: "from status",
  none: "",
};

const formatDay = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** One line for a bar's tooltip and its screen-reader label: what it is, when, how far along, and why. */
export function describeGanttRow(row: GanttRow): string {
  const parts = [`${row.title} (${KIND_LABEL[row.kind]})`];
  if (row.overdue) parts.push("overdue");
  // A clipped bar is drawn from the edge of the chart, so say where it really began.
  parts.push(`${formatDay(row.actualStart)} to ${formatDay(row.end)}`);
  parts.push(row.percent == null ? "no progress recorded" : `${row.percent}% ${SOURCE_PHRASE[row.source]}`.trim());
  if (row.note) parts.push(row.note);
  return parts.join(" · ");
}
