import { TRIAGE_ACTION_TITLE_MAX_CHARS } from "@/lib/email-triage/constants";
import type { RawSuggestedAction } from "@/lib/email-triage/stage2";
import { suggestedActionSchema, type SuggestedAction } from "@/lib/email-triage/types";

export interface NormalizeContext {
  now: Date;
  /** YYYY-MM-DD for "now" in the user's timezone (event dates before it are dropped). */
  today: string;
  /** Owned, live course ids. A deadline's course_id must be one of these. */
  courseIds: ReadonlySet<string>;
}

/** A future, parseable instant as a UTC ISO string, or undefined. */
function futureIso(value: string | null | undefined, now: Date): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) return undefined;
  return parsed.toISOString();
}

/**
 * Applies the server-side rules that decide what is actually offered, so the
 * card and voice agree and the model can't push an unusable action:
 * - deadline needs a validated course_id and a future due_at, else it is a task
 * - event needs date + time + duration (and a non-past date), else it is a task
 * - reminder becomes a task with a reminder (no standalone reminder create)
 * - past or unparsable due_at is dropped (the action keeps its title)
 * Returns null when there is nothing usable (empty title, schema mismatch).
 */
export function normalizeSuggestedAction(raw: RawSuggestedAction | null, context: NormalizeContext): SuggestedAction | null {
  if (!raw) return null;
  const title = raw.title.trim().slice(0, TRIAGE_ACTION_TITLE_MAX_CHARS).trim();
  if (!title) return null;

  const dueAt = futureIso(raw.due_at, context.now);
  const courseId = raw.course_id && context.courseIds.has(raw.course_id) ? raw.course_id : undefined;

  let candidate: Record<string, unknown>;
  switch (raw.kind) {
    case "deadline":
      candidate =
        dueAt && courseId
          ? { kind: "deadline", title, due_at: dueAt, course_id: courseId }
          : { kind: "task", title, ...(dueAt ? { due_at: dueAt } : {}) };
      break;
    case "event": {
      const duration = raw.duration_minutes;
      const hasEvent =
        raw.date &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.date) &&
        raw.date >= context.today &&
        raw.time &&
        /^\d{2}:\d{2}$/.test(raw.time) &&
        typeof duration === "number" &&
        Number.isInteger(duration) &&
        duration >= 1 &&
        duration <= 1440;
      candidate = hasEvent
        ? { kind: "event", title, date: raw.date, time: raw.time, duration_minutes: duration }
        : { kind: "task", title, ...(dueAt ? { due_at: dueAt } : {}) };
      break;
    }
    case "reminder":
      candidate = dueAt
        ? { kind: "task", title, due_at: dueAt, reminders_enabled: true }
        : { kind: "task", title };
      break;
    case "task":
    default:
      candidate = { kind: "task", title, ...(dueAt ? { due_at: dueAt } : {}) };
      break;
  }

  const parsed = suggestedActionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
