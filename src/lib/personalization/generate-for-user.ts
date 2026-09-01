import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { groupLowRatingFeedback, type LowRatingFeedbackRow } from "@/lib/personalization/candidates";
import { generateSuggestion } from "@/lib/personalization/generate";
import {
  APPLIED_COOLDOWN_DAYS,
  DISMISSAL_COOLDOWN_DAYS,
  LOW_RATING_LOOKBACK_DAYS,
  LOW_RATING_MAX,
  LOW_RATING_MIN_COUNT,
} from "@/lib/personalization/constants";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GenerateSuggestionsResult {
  candidatesEvaluated: number;
  created: number;
  skipped: number;
}

async function fetchCurrentLeadMinutes(
  supabase: SupabaseClient<Database>,
  userId: string,
  scope: "course" | "task",
  targetId: string,
): Promise<number | null> {
  const table = scope === "course" ? "courses" : "tasks";
  const { data } = await supabase
    .from(table)
    .select("reminder_lead_minutes")
    .eq("id", targetId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.reminder_lead_minutes ?? null;
}

/**
 * On-demand only, never a scheduled job (each call costs an LLM request) —
 * shared by POST /api/suggestions/generate (src/app/api/suggestions/
 * generate/route.ts) and the voice queryKind "personalization_suggestions"
 * (src/lib/voice/suggestions-lookup.ts), so both entry points run the exact
 * same candidate-selection/cooldown/insert logic. Throws on unexpected DB
 * errors — callers wrap in their own try/catch (mirrors src/lib/api/
 * cascade.ts's cascadeDeleteCourse/cascadeDeleteTask).
 */
export async function generateSuggestionsForUser(supabase: SupabaseClient<Database>, userId: string): Promise<GenerateSuggestionsResult> {
  const lookbackStart = new Date(Date.now() - LOW_RATING_LOOKBACK_DAYS * DAY_MS).toISOString();

  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("feedback")
    .select("id, target_type, target_id, rating, comment, created_at")
    .eq("user_id", userId)
    .in("target_type", ["deadline", "task"])
    .lte("rating", LOW_RATING_MAX)
    .gte("created_at", lookbackStart);
  if (feedbackError) throw feedbackError;

  const deadlineFeedback = (feedbackRows ?? []).filter((row) => row.target_type === "deadline");
  const taskFeedback = (feedbackRows ?? []).filter((row) => row.target_type === "task");

  // Resolve deadline feedback to its governing course_id — a deadline
  // inherits its reminder timing from its Course, so that's the row a
  // suggestion must target, never the deadline itself.
  const deadlineIds = deadlineFeedback.map((row) => row.target_id);
  const { data: deadlines, error: deadlinesError } =
    deadlineIds.length > 0
      ? await supabase.from("deadlines").select("id, course_id, deleted_at").in("id", deadlineIds).eq("user_id", userId)
      : { data: [], error: null };
  if (deadlinesError) throw deadlinesError;
  const deadlineToCourseId = new Map(
    (deadlines ?? []).filter((deadline) => deadline.deleted_at === null).map((deadline) => [deadline.id, deadline.course_id]),
  );

  const taskIds = taskFeedback.map((row) => row.target_id);
  const { data: tasks, error: tasksError } =
    taskIds.length > 0
      ? await supabase.from("tasks").select("id, deleted_at").in("id", taskIds).eq("user_id", userId)
      : { data: [], error: null };
  if (tasksError) throw tasksError;
  const liveTaskIds = new Set((tasks ?? []).filter((task) => task.deleted_at === null).map((task) => task.id));

  const resolvedRows: LowRatingFeedbackRow[] = [];
  for (const row of deadlineFeedback) {
    const courseId = deadlineToCourseId.get(row.target_id);
    if (!courseId) continue; // deadline missing or soft-deleted
    resolvedRows.push({ id: row.id, scope: "course", targetId: courseId, rating: row.rating, comment: row.comment, createdAt: row.created_at });
  }
  for (const row of taskFeedback) {
    if (!liveTaskIds.has(row.target_id)) continue; // task missing or soft-deleted
    resolvedRows.push({ id: row.id, scope: "task", targetId: row.target_id, rating: row.rating, comment: row.comment, createdAt: row.created_at });
  }

  const candidates = groupLowRatingFeedback(resolvedRows, LOW_RATING_MIN_COUNT);

  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const { data: pendingExisting, error: pendingError } = await supabase
      .from("personalization_suggestions")
      .select("id")
      .eq("user_id", userId)
      .eq("scope", candidate.scope)
      .eq("target_id", candidate.targetId)
      .eq("status", "pending")
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (pendingExisting) {
      skipped += 1;
      continue;
    }

    // Respects an explicit Dismiss for a while instead of immediately
    // re-proposing the same change on the next click. .limit(1) before
    // .maybeSingle(): dismissed/applied rows accumulate as an audit trail
    // (never deleted), so more than one can fall inside the cooldown window
    // — without the cap, a second match makes maybeSingle() throw instead
    // of returning one row.
    const cooldownStart = new Date(Date.now() - DISMISSAL_COOLDOWN_DAYS * DAY_MS).toISOString();
    const { data: recentDismissal, error: dismissalError } = await supabase
      .from("personalization_suggestions")
      .select("id")
      .eq("user_id", userId)
      .eq("scope", candidate.scope)
      .eq("target_id", candidate.targetId)
      .eq("status", "dismissed")
      .gte("dismissed_at", cooldownStart)
      .limit(1)
      .maybeSingle();
    if (dismissalError) throw dismissalError;
    if (recentDismissal) {
      skipped += 1;
      continue;
    }

    // The feedback behind an Apply isn't consumed, so the same old ratings
    // could otherwise propose a further change before there's been time to
    // see whether the last one helped.
    const appliedCooldownStart = new Date(Date.now() - APPLIED_COOLDOWN_DAYS * DAY_MS).toISOString();
    const { data: recentlyApplied, error: appliedError } = await supabase
      .from("personalization_suggestions")
      .select("id")
      .eq("user_id", userId)
      .eq("scope", candidate.scope)
      .eq("target_id", candidate.targetId)
      .eq("status", "applied")
      .gte("applied_at", appliedCooldownStart)
      .limit(1)
      .maybeSingle();
    if (appliedError) throw appliedError;
    if (recentlyApplied) {
      skipped += 1;
      continue;
    }

    const currentLeadMinutes = await fetchCurrentLeadMinutes(supabase, userId, candidate.scope, candidate.targetId);
    if (currentLeadMinutes === null) {
      skipped += 1;
      continue;
    }

    // A malformed/unhelpful LLM response only skips this one candidate — it
    // must never fail the whole "check for suggestions" attempt.
    let generated: Awaited<ReturnType<typeof generateSuggestion>>;
    try {
      generated = await generateSuggestion({ scope: candidate.scope, currentLeadMinutes, feedback: candidate.ratings });
    } catch (error) {
      console.error("generateSuggestion failed", error);
      skipped += 1;
      continue;
    }
    if (generated.toLeadMinutes === currentLeadMinutes) {
      skipped += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("personalization_suggestions").insert({
      user_id: userId,
      scope: candidate.scope,
      target_id: candidate.targetId,
      from_value: currentLeadMinutes,
      to_value: generated.toLeadMinutes,
      rationale: generated.rationale,
      source_feedback_ids: candidate.feedbackIds,
    });
    if (insertError) {
      // Lost a race against a concurrent "check for suggestions" attempt
      // for the same target — the partial unique index caught it, not an
      // error.
      if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
        skipped += 1;
        continue;
      }
      throw insertError;
    }
    created += 1;
  }

  return { candidatesEvaluated: candidates.length, created, skipped };
}
