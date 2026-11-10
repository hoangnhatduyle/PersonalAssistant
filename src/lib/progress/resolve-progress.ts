import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";
import { buildSessionProgress } from "@/lib/deadlines/session-progress";

/**
 * Where a progress figure came from. "manual" is the user's own `progress_percent`
 * and always wins; the rest are derived from data the app already tracks.
 */
export type ProgressSource = "manual" | "session-time" | "session-count" | "checklist" | "status" | "none";

export interface ResolvedProgress {
  /** 0-100, or null when nothing is known (no hand-set value and nothing to derive it from). */
  percent: number | null;
  source: ProgressSource;
  note: string | null;
}

export interface ChecklistTotals {
  done: number;
  total: number;
}

type ProgressFields = { progress_percent: number | null; progress_note: string | null };

const NONE: ResolvedProgress = { percent: null, source: "none", note: null };

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

function toPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

/**
 * The hand-set value is checked with `!= null`, never truthiness: 0 % is a real,
 * deliberate answer ("not started yet") and must beat anything derived.
 */
function manualProgress(item: ProgressFields): ResolvedProgress | null {
  if (item.progress_percent == null) return null;
  return { percent: item.progress_percent, source: "manual", note: cleanNote(item.progress_note) };
}

type SessionLike = Pick<AppointmentRow, "deadline_id" | "session_status" | "duration_minutes">;

/**
 * A deadline's progress: the hand-set percent, else 100 once Completed, else derived from its
 * sessions -- done minutes over `estimated_hours` when there is an estimate, otherwise done / total
 * sessions (skipped sessions stay in the total, see buildSessionProgress).
 */
export function resolveDeadlineProgress(
  deadline: Pick<DeadlineRow, "id" | "status" | "estimated_hours" | "progress_percent" | "progress_note">,
  sessions: SessionLike[],
): ResolvedProgress {
  const manual = manualProgress(deadline);
  if (manual) return manual;

  const note = cleanNote(deadline.progress_note);
  if (deadline.status === "Completed") return { percent: 100, source: "status", note };

  const own = sessions.filter((session) => session.deadline_id === deadline.id);

  if (deadline.estimated_hours != null && deadline.estimated_hours > 0) {
    const doneMinutes = own.reduce((sum, session) => (session.session_status === "done" ? sum + (session.duration_minutes ?? 0) : sum), 0);
    return { percent: toPercent(doneMinutes / (deadline.estimated_hours * 60)), source: "session-time", note };
  }

  const tally = buildSessionProgress(own)[0];
  if (tally && tally.total > 0) return { percent: toPercent(tally.ratio), source: "session-count", note };

  return { ...NONE, note };
}

/** A task's progress: the hand-set percent, else 100 once Done, else checklist done / total. */
export function resolveTaskProgress(
  task: Pick<TaskRow, "status" | "progress_percent" | "progress_note">,
  checklist: ChecklistTotals | undefined,
): ResolvedProgress {
  const manual = manualProgress(task);
  if (manual) return manual;

  const note = cleanNote(task.progress_note);
  if (task.status === "Done") return { percent: 100, source: "status", note };
  if (checklist && checklist.total > 0) return { percent: toPercent(checklist.done / checklist.total), source: "checklist", note };

  return { ...NONE, note };
}

/** A session's progress: the hand-set percent (part-way through), else 100 when done and 0 otherwise. */
export function resolveSessionProgress(
  session: Pick<AppointmentRow, "session_status" | "progress_percent" | "progress_note">,
): ResolvedProgress {
  const manual = manualProgress(session);
  if (manual) return manual;

  const note = cleanNote(session.progress_note);
  if (session.session_status === "done") return { percent: 100, source: "status", note };
  if (session.session_status === "planned" || session.session_status === "skipped") return { percent: 0, source: "status", note };

  return { ...NONE, note };
}

/** What a form shows beside the slider when no value is set by hand: the derived percent and why. */
export interface AutoProgress {
  percent: number | null;
  hint?: string;
}

const SOURCE_HINT: Partial<Record<ProgressSource, string>> = {
  "session-time": "From done sessions' time against your estimate",
  "session-count": "From done sessions out of all planned sessions",
  checklist: "From checklist items done",
  status: "From status",
};

/** Turns a derived (not hand-set) result into the slider's "Auto" readout and its one-line explanation. */
export function toAutoProgress(resolved: ResolvedProgress): AutoProgress {
  return { percent: resolved.percent, hint: SOURCE_HINT[resolved.source] };
}
