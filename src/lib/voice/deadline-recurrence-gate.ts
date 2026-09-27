import { mutationSchema, type EntityContext, type RawMutation } from "@/lib/voice/intent";
import type { DraftMutationRecord } from "@/lib/voice/conversation-memory";

/**
 * Deterministic clarifying steps for repeating Deadlines
 * (supabase/migrations/0041_deadline_recurrence.sql, 0042_deadline_series.sql):
 * "should this repeat?" on a create, and "just this occurrence or the whole
 * series?" when cancelling one. Enforced
 * here in code rather than left to the model's judgement so it can never be
 * skipped: a Deadline create the user hasn't said anything about repeating
 * (recurring null) is turned into a clarifying question instead of a
 * proposal. The default answer is "no" — if the question was already asked
 * and the next proposal still doesn't say, the deadline is one-off.
 *
 * The fixed question strings double as the loop guard: the open draft's
 * saved `question` (for the same deadline) tells us this exact question was
 * already put to the user.
 */
export const RECURRENCE_QUESTION = "Should this deadline repeat weekly? If so, tell me which days and until when.";
export const RECURRENCE_DAYS_QUESTION = "Which days of the week should it repeat on, and until when?";
export const CANCEL_SCOPE_QUESTION = "That deadline repeats. Should I cancel just this occurrence, or the whole series?";
export const CANCEL_SERIES_WHICH_QUESTION = "Which repeating series should I cancel?";

export type RecurrenceGateResult =
  | { kind: "ask"; question: string; mutation: RawMutation }
  | { kind: "proceed"; mutation: RawMutation };

const normalizeTitle = (title: string | null | undefined) => (title ?? "").trim().toLowerCase();

/** Same deadline: a create is identified by course + title, an update/transition by target id. */
function isSameSubject(asked: RawMutation | undefined, current: RawMutation): boolean {
  if (asked?.target_type !== "deadline" || current.target_type !== "deadline" || asked.operation !== current.operation) return false;
  if (current.operation === "create") {
    return asked.course_id === current.course_id && normalizeTitle(asked.title) === normalizeTitle(current.title);
  }
  return asked.target_id === current.target_id;
}

/**
 * This exact question is already open AND it was asked about this same
 * deadline -- not merely the same question string, or an unrelated follow-up
 * ("add another deadline for my lab report") would silently inherit the
 * previous deadline's default instead of being asked.
 */
function alreadyAsked(draft: DraftMutationRecord | null, question: string, current: RawMutation): boolean {
  return draft?.question === question && isSameSubject(draft.mutation, current);
}

function seriesKey(deadline: EntityContext["deadlines"][number]): string {
  return `${normalizeTitle(deadline.title)}::${deadline.course_id}`;
}

function uniqueSeries(deadlines: EntityContext["deadlines"]): EntityContext["deadlines"] {
  const seen = new Set<string>();
  const unique: EntityContext["deadlines"] = [];
  for (const deadline of deadlines) {
    const key = seriesKey(deadline);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(deadline);
  }
  return unique;
}

function whichSeriesQuestion(series: EntityContext["deadlines"], courses: EntityContext["courses"] = []): string {
  const labels = series.map((deadline) => {
    const course = courses.find((row) => row.id === deadline.course_id);
    const courseLabel = course?.code || course?.name;
    return courseLabel ? `${deadline.title} for ${courseLabel}` : deadline.title;
  });
  if (labels.length <= 1) return CANCEL_SERIES_WHICH_QUESTION;
  if (labels.length === 2) return `Which repeating series should I cancel — ${labels[0]}, or ${labels[1]}?`;
  return `Which repeating series should I cancel — ${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}?`;
}

export function gateDeadlineRecurrence(
  raw: RawMutation,
  openDraft: DraftMutationRecord | null,
  context: Pick<EntityContext, "deadlines"> & Partial<Pick<EntityContext, "courses">>,
): RecurrenceGateResult {
  if (raw.target_type !== "deadline") return { kind: "proceed", mutation: raw };

  // Cancelling a repeating deadline: ask which scope once; unclear = just this occurrence (the least destructive).
  if (raw.operation === "transition") {
    if (raw.event === "user_cancels" && raw.cancel_scope === "series" && !raw.target_id) {
      const recurring = context.deadlines.filter((deadline) => deadline.recurring);
      const titled = raw.title ? recurring.filter((deadline) => normalizeTitle(deadline.title) === normalizeTitle(raw.title)) : recurring;
      const series = uniqueSeries(titled);
      if (series.length === 1) return { kind: "proceed", mutation: { ...raw, target_id: series[0].id } };
      if (series.length > 1) return { kind: "ask", question: whichSeriesQuestion(series, context.courses ?? []), mutation: raw };
      return { kind: "proceed", mutation: raw };
    }
    const target = context.deadlines.find((deadline) => deadline.id === raw.target_id);
    if (raw.event !== "user_cancels" || !target?.recurring || raw.cancel_scope !== null) return { kind: "proceed", mutation: raw };
    if (alreadyAsked(openDraft, CANCEL_SCOPE_QUESTION, raw)) return { kind: "proceed", mutation: { ...raw, cancel_scope: "occurrence" } };
    return { kind: "ask", question: CANCEL_SCOPE_QUESTION, mutation: raw };
  }

  if (raw.operation !== "create" && raw.operation !== "update") return { kind: "proceed", mutation: raw };

  // Only ask on an otherwise-complete mutation; an incomplete one keeps
  // failing on its own missing field exactly as before.
  // An update may still carry a leftover course_id; that field is rejected
  // later by mutationSchema and must not skip the days question.
  const isComplete = mutationSchema.safeParse({
    ...raw,
    recurring: false,
    ...(raw.operation === "update" ? { course_id: null } : {}),
  }).success;
  if (!isComplete) return { kind: "proceed", mutation: raw };

  // "Repeats" but no days resolved: ask which days, once.
  if (raw.recurring === true && (raw.recurrence_days?.length ?? 0) === 0) {
    if (alreadyAsked(openDraft, RECURRENCE_DAYS_QUESTION, raw)) return { kind: "proceed", mutation: { ...raw, recurring: false } };
    return { kind: "ask", question: RECURRENCE_DAYS_QUESTION, mutation: raw };
  }

  // Never asked about (create only): ask once, then default to one-off.
  if (raw.operation === "create" && raw.recurring === null) {
    if (alreadyAsked(openDraft, RECURRENCE_QUESTION, raw)) return { kind: "proceed", mutation: { ...raw, recurring: false } };
    return { kind: "ask", question: RECURRENCE_QUESTION, mutation: raw };
  }

  return { kind: "proceed", mutation: raw };
}
