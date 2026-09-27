import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a planned Session still counts as "actively worked on." Any
 * future-dated planned Session counts too, however far out. */
const SESSION_SUPPRESSION_LOOKBACK_DAYS = 7;

// Checked in order, first match wins. An overdue item (negative
// daysUntilDue) always satisfies the first tier's <= check. An item that
// matches no tier (including a null due_at, tasks only) gets Infinity —
// never flagged, since there's nothing to be "behind schedule" against.
const STALE_TIERS: { maxDaysUntilDue: number; staleAfterDays: number }[] = [
  { maxDaysUntilDue: 3, staleAfterDays: 1 },
  { maxDaysUntilDue: 14, staleAfterDays: 5 },
  { maxDaysUntilDue: 21, staleAfterDays: 10 },
];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A flat "untouched N days" threshold treats an item due next month the
 * same as one due tomorrow — this scales the threshold by how close due_at
 * actually is, so staleness tracks "behind schedule" instead of just "old."
 */
function staleThresholdFor(dueAt: string | null, now: Date): number {
  if (!dueAt) return Number.POSITIVE_INFINITY;
  const daysUntilDue = Math.round((startOfDay(new Date(dueAt)) - startOfDay(now)) / DAY_MS);
  for (const tier of STALE_TIERS) {
    if (daysUntilDue <= tier.maxDaysUntilDue) return tier.staleAfterDays;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * The timestamp an item was last touched: a real edit (updated_at), a
 * manual "still on it" acknowledgment (acknowledged_at, written by the
 * /acknowledge routes), or — Tasks only — activity on a child row
 * (checklist item, attachment, linked note) that doesn't bump the task's
 * own updated_at on its own. Whichever is most recent wins.
 */
function lastTouchedAt(updatedAt: string, acknowledgedAt: string | null, childActivityAt: Date | null = null): Date {
  const candidates = [new Date(updatedAt).getTime()];
  if (acknowledgedAt) candidates.push(new Date(acknowledgedAt).getTime());
  if (childActivityAt) candidates.push(childActivityAt.getTime());
  return new Date(Math.max(...candidates));
}

/**
 * Deadlines only — a Task has no session link (appointments.deadline_id is
 * the only FK a Session row carries). A planned Session logged against this
 * deadline recently, or scheduled anytime ahead, means real work is
 * happening even though the deadline row itself hasn't been touched.
 */
function hasSuppressingSession(deadlineId: string, appointments: AppointmentRow[], now: Date): boolean {
  const cutoffKey = toDateKey(new Date(startOfDay(now) - SESSION_SUPPRESSION_LOOKBACK_DAYS * DAY_MS));
  return appointments.some(
    (appointment) =>
      appointment.category === "Session" &&
      appointment.session_status === "planned" &&
      appointment.deadline_id === deadlineId &&
      appointment.date >= cutoffKey,
  );
}

export interface StaleItem {
  id: string;
  kind: "deadline" | "task";
  title: string;
  href: string;
  updatedAt: Date;
  daysSinceUpdate: number;
  dueAt: Date | null;
  /** daysSinceUpdate / threshold. Always >= 1 for an included item, since
   * that ratio crossing 1 is the inclusion criterion itself. */
  neglectRatio: number;
}

/**
 * Open items untouched for longer than a threshold scaled by how close
 * their due_at is (see staleThresholdFor) — the same updated_at-as-proxy
 * convention buildCompletedThisWeek uses for "done," inverted for
 * "neglected." Only open/incomplete items qualify (mirrors
 * isOpenDeadline/isOpenTask): a stale Completed/Done/Cancelled item isn't
 * "at risk," it's resolved work that's meant to be left alone. Deadlines
 * with a recent or upcoming planned Session are suppressed even past
 * threshold — see hasSuppressingSession. taskActivity (keyed by task id) is
 * an optional last-child-activity lookup — see lastTouchedAt — built from
 * GET /api/tasks/activity; callers that don't have it (or don't care) can
 * omit it.
 */
export function buildStaleItems(
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  appointments: AppointmentRow[] = [],
  taskActivity: Map<string, Date> = new Map(),
  now: Date = new Date(),
): StaleItem[] {
  const todayStart = startOfDay(now);
  const items: StaleItem[] = [];

  const daysSince = (touchedAt: Date) => Math.round((todayStart - startOfDay(touchedAt)) / DAY_MS);

  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    if (hasSuppressingSession(deadline.id, appointments, now)) continue;
    const touchedAt = lastTouchedAt(deadline.updated_at, deadline.acknowledged_at);
    const daysSinceUpdate = daysSince(touchedAt);
    const threshold = staleThresholdFor(deadline.due_at, now);
    if (daysSinceUpdate < threshold) continue;
    items.push({
      id: deadline.id,
      kind: "deadline",
      title: deadline.title,
      href: `/courses/deadlines/${deadline.id}`,
      updatedAt: touchedAt,
      daysSinceUpdate,
      dueAt: deadline.due_at ? new Date(deadline.due_at) : null,
      neglectRatio: daysSinceUpdate / threshold,
    });
  }

  for (const task of tasks) {
    if (!isOpenTask(task.status)) continue;
    const touchedAt = lastTouchedAt(task.updated_at, task.acknowledged_at, taskActivity.get(task.id) ?? null);
    const daysSinceUpdate = daysSince(touchedAt);
    const threshold = staleThresholdFor(task.due_at, now);
    if (daysSinceUpdate < threshold) continue;
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      href: `/board/${task.id}`,
      updatedAt: touchedAt,
      daysSinceUpdate,
      dueAt: task.due_at ? new Date(task.due_at) : null,
      neglectRatio: daysSinceUpdate / threshold,
    });
  }

  // Primary: how far past its own threshold an item is — itself already
  // due-date-scaled (see STALE_TIERS). Tie-break: nearer due date first, so
  // two items at the same ratio don't rank on raw day count alone.
  return items.sort((a, b) => {
    if (b.neglectRatio !== a.neglectRatio) return b.neglectRatio - a.neglectRatio;
    const aDue = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}
