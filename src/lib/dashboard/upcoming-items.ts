import type { AppointmentRow, CourseRow, DeadlineRow, DeadlineStatus, TaskRow, TaskStatus, ReminderRow, TodoItemRow, PersonRow } from "@/lib/api/entity-types";
import { findConflictingAppointmentIds, parseStructuredTime } from "@/lib/appointments/conflicts";
import { findCourseConflictingAppointmentIds } from "@/lib/appointments/course-conflicts";

export type UpcomingItemKind = "deadline" | "task" | "reminder" | "todo" | "session" | "appointment";

export type TimeWindowFilter = "today" | "tomorrow" | "3days" | "7days" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

function localDayOffset(itemAt: Date, now: Date): number {
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOf(itemAt) - startOf(now)) / DAY_MS);
}

export interface UpcomingItem {
  id: string;
  kind: UpcomingItemKind;
  title: string;
  at: Date;
  href: string | null;
  /** Overdue deadlines and Delivered reminders need action now, not "soon". */
  urgent: boolean;
  /** Appointment-kind only: this appointment's time range overlaps another appointment on the same day (see src/lib/appointments/conflicts.ts). */
  conflict?: boolean;
  /** Appointment-kind only: this appointment's time range overlaps a Course's recurring meeting block (see src/lib/appointments/course-conflicts.ts). */
  courseConflict?: boolean;
  /** Task-kind only: set when this Task belongs to a tracked Person (People feature) rather than the account owner. null/undefined = the owner's own item. */
  personId?: string | null;
  /** Task-kind only: "Me" when personId is null/undefined, else that Person's name. */
  personLabel?: string;
}

export function isOpenDeadline(status: DeadlineStatus): boolean {
  return status !== "Completed" && status !== "Cancelled";
}

export function isOpenTask(status: TaskStatus): boolean {
  return status === "Open";
}

interface BuildUpcomingItemsInput {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  reminders?: ReminderRow[];
  todoItems?: TodoItemRow[];
  /** Deadline Sessions: appointments rows tagged category "Session". Only "planned" ones are actionable/upcoming. */
  appointments?: AppointmentRow[];
  /** Tracked People (People feature), for resolving a Task's person_id to a display name. Deadlines/Sessions/Todo items/Appointments are always the account owner's own by this point — only Tasks can belong to a tracked person. */
  people?: PersonRow[];
  /** For flagging a general Event/Appointment whose time overlaps a Course's recurring meeting block (courseConflict). */
  courses?: CourseRow[];
}

/**
 * Merges the three entity types dashboard widgets draw from into one
 * ascending-sorted timeline. No `/api/dashboard` route exists — this
 * composes already-fetched, already-cached list data client-side.
 */
export function buildUpcomingItems({
  deadlines,
  tasks,
  reminders = [],
  todoItems = [],
  appointments = [],
  people = [],
  courses = [],
}: BuildUpcomingItemsInput): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  const now = Date.now();

  const personById = new Map(people.map((person) => [person.id, person]));
  function personInfo(personId: string | null): { personId: string | null; personLabel: string } {
    if (!personId) return { personId: null, personLabel: "Me" };
    return { personId, personLabel: personById.get(personId)?.name ?? "Unknown" };
  }

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    const at = new Date(deadline.due_at);
    items.push({
      id: deadline.id,
      kind: "deadline",
      title: deadline.title,
      at,
      href: `/deadlines/${deadline.id}`,
      // Overdue status is the authoritative signal, but a due_at that's
      // slipped past "now" without the status catching up yet (a lag this
      // codebase already accounts for elsewhere — see MomentumCard's
      // nearestDeadline comment) should still read as past due.
      urgent: deadline.status === "Overdue" || at.getTime() < now,
    });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.due_at) continue;
    const at = new Date(task.due_at);
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      at,
      href: `/tasks/${task.id}`,
      urgent: at.getTime() < now,
      ...personInfo(task.person_id),
    });
  }

  // toISOString().slice(0, 10) reads the UTC calendar day, not the user's
  // local one — in the evening in any timezone behind UTC, that's already
  // "tomorrow" in UTC, which wrongly marked today's items as past due
  // (urgent). Build the date key from local getFullYear/getMonth/getDate
  // instead, matching due_date's own local-calendar-day semantics.
  const todayLocal = new Date();
  const today = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;

  for (const item of todoItems) {
    if (item.is_done || !item.due_date) continue;
    // due_date is a calendar day (YYYY-MM-DD), not an instant — compare dates
    // like CourseTodoListCard, and use end-of-local-day for sorting/relative time.
    const at = new Date(`${item.due_date}T23:59:59.999`);
    items.push({
      id: item.id,
      kind: "todo",
      title: item.title,
      at,
      href: "/courses/todos",
      urgent: item.due_date < today,
    });
  }

  // Deadline Sessions: appointments rows tagged category "Session". Only
  // "planned" ones are actionable/upcoming here — a done/skipped session has
  // nothing left to act on, matching isOpenDeadline/isOpenTask's convention
  // of excluding closed-out items from the queue.
  //
  // Every other category is a general Appointment/Event (AppointmentForm on
  // /calendar) — these carry a real structured time, so conflicts (against
  // other appointments, and against a Course's recurring meeting blocks) are
  // computed once up front and surfaced per item below. Only "planned"
  // event_status items are actionable/upcoming here, same convention as
  // Sessions above — a done/missed Event has nothing left to act on.
  const conflictingAppointmentIds = findConflictingAppointmentIds(appointments);
  const courseConflictingAppointmentIds = findCourseConflictingAppointmentIds(appointments, courses);
  for (const appointment of appointments) {
    if (appointment.category === "Session") {
      if (appointment.session_status !== "planned") continue;
      const at = new Date(`${appointment.date}T23:59:59.999`);
      items.push({
        id: appointment.id,
        kind: "session",
        title: appointment.title,
        at,
        href: appointment.deadline_id ? `/deadlines/${appointment.deadline_id}` : null,
        urgent: appointment.date < today,
      });
      continue;
    }

    if (appointment.event_status !== "planned") continue;

    const structuredMinutes = parseStructuredTime(appointment.time);
    const at =
      structuredMinutes === null
        ? new Date(`${appointment.date}T23:59:59.999`)
        : new Date(`${appointment.date}T${appointment.time}:00`);
    items.push({
      id: appointment.id,
      kind: "appointment",
      title: appointment.title,
      at,
      href: "/calendar",
      urgent: appointment.date < today,
      conflict: conflictingAppointmentIds.has(appointment.id),
      courseConflict: courseConflictingAppointmentIds.has(appointment.id),
    });
  }

  if (reminders.length > 0) {
    const deadlineById = new Map(deadlines.map((deadline) => [deadline.id, deadline]));
    const taskById = new Map(tasks.map((task) => [task.id, task]));

    for (const reminder of reminders) {
      const target = reminder.target_type === "deadline" ? deadlineById.get(reminder.target_id) : taskById.get(reminder.target_id);
      // Reminders are owner-only, matching Voice Assistant (which has no
      // reminder concept for a tracked Person at all) — a reminder whose
      // target resolves to a tracked person's Deadline/Task is excluded
      // here rather than trusting callers to have pre-filtered `deadlines`/
      // `tasks`; an unresolvable target (deleted item) is NOT excluded, it
      // still falls back to the generic "Reminder" title below.
      if (target?.person_id) continue;

      // A Snoozed reminder's next-relevant time is snooze_until, not its
      // original (now-past) trigger_at.
      const at =
        reminder.acknowledgment_state === "Snoozed" && reminder.snooze_until ? reminder.snooze_until : reminder.trigger_at;
      const title = target?.title ?? "Reminder";

      items.push({
        id: reminder.id,
        kind: "reminder",
        title,
        at: new Date(at),
        href: null,
        urgent: reminder.acknowledgment_state === "Delivered",
      });
    }
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Narrows a sorted upcoming-items list to a calendar-day window relative to `now`. */
export function filterUpcomingItemsByTimeWindow(items: UpcomingItem[], window: TimeWindowFilter, now: Date = new Date()): UpcomingItem[] {
  if (window === "all") return items;

  return items.filter((item) => {
    const offset = localDayOffset(item.at, now);
    switch (window) {
      case "today":
        return offset <= 0;
      case "tomorrow":
        return offset <= 1;
      case "3days":
        return offset <= 2;
      case "7days":
        return offset <= 6;
      default:
        return true;
    }
  });
}
