import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  computeConfirmationExpiry,
  isConfirmationExpired,
  meetsConfidenceBar,
  resolveVoiceTransition,
  type VoiceSessionState,
  type VoiceTransitionEvent,
} from "@/lib/voice/transitions";
import { formatCascadeDisclosure, previewCourseDeleteCascade } from "@/lib/voice/cascade-preview";
import { executePendingMutation, type MutationExecutionResult, type PendingMutation } from "@/lib/voice/mutations";
import { loadUserTimezone, type ResolveIntentFn, type ResolvedIntent } from "@/lib/voice/intent";
import { runKnowledgeLookup, type KnowledgeCitation, type KnowledgeLookupFn } from "@/lib/knowledge/retrieval";
import { runSuggestionsLookup, type SuggestionsLookupFn } from "@/lib/voice/suggestions-lookup";
import { runGeneralConversation, type GeneralConversationFn } from "@/lib/voice/general-conversation";
import { resolveScheduleWindowBounds, resolveScheduleWindowDateKeys, type ScheduleTimeWindow } from "@/lib/voice/schedule-time-window";
import { rankScheduleItems, formatScheduleAnswer, type ScheduleItem } from "@/lib/voice/schedule-formatting";

export class VoiceSessionNotFoundError extends Error {}
export class VoiceSessionInvalidStateError extends Error {}
export class VoiceSessionExpiredError extends Error {}

export interface TranscribeFn {
  (audio: Buffer, mimetype?: string): Promise<string>;
}
export type { ResolveIntentFn };

export interface VoiceTurnDeps {
  transcribe: TranscribeFn;
  resolveIntent: ResolveIntentFn;
  /** Defaults to src/lib/knowledge/retrieval.ts's runKnowledgeLookup when omitted. */
  knowledgeLookup?: KnowledgeLookupFn;
  /** Defaults to src/lib/voice/suggestions-lookup.ts's runSuggestionsLookup when omitted. */
  suggestionsLookup?: SuggestionsLookupFn;
  /** Defaults to src/lib/voice/general-conversation.ts's runGeneralConversation when omitted. */
  generalConversation?: GeneralConversationFn;
}

export type VoiceTurnInput = { audio: Buffer; mimetype?: string } | { transcript: string };

export interface VoiceTurnResult {
  sessionId: string;
  state: "AwaitingConfirmation" | "Responding";
  message: string;
  executed?: boolean;
  data?: unknown;
  /** SPEC-API-008 VoiceTurnResult (extended): set only for a knowledge_lookup response. */
  citations?: KnowledgeCitation[];
  extractionLabel?: "machine_extracted";
  /** Set only for a personalization_suggestions response — tells the client to kick off the review-aloud loop (src/hooks/useReviewSuggestionsAloud.ts) once this message has been spoken. */
  queryKind?: "personalization_suggestions";
  /** When true, the response expects further user input (clarification, retry). Hands-free mic should only re-arm when this is true and audio playback succeeded. */
  needsFollowUp?: boolean;
}

/**
 * Validated, ownership-scoped, compare-and-swap UPDATE: mirrors
 * src/lib/api/reminders/[id]/ack's own optimistic-lock pattern (re-asserting
 * `user_id` + the current state on the UPDATE itself, not just a preceding
 * SELECT). Security/code-review finding: two concurrent callers racing the
 * same transition (e.g. a double-tap confirm) must not both apply it — the
 * `.eq("state", fromState)` predicate means only the first writer's UPDATE
 * actually matches a row; the loser gets 0 rows back and fails fast with
 * VoiceSessionInvalidStateError instead of silently re-executing whatever
 * mutation the transition was gating.
 */
async function transition(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  fromState: VoiceSessionState,
  event: VoiceTransitionEvent,
  fields: Record<string, unknown>,
): Promise<void> {
  const nextState = resolveVoiceTransition(event, fromState);
  if (!nextState) {
    throw new VoiceSessionInvalidStateError(`Cannot apply voice event "${event}" from state "${fromState}"`);
  }
  const { data, error } = await supabase
    .from("voice_sessions")
    .update({ state: nextState, ...fields })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("state", fromState)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new VoiceSessionInvalidStateError(
      `Session ${sessionId} was no longer in state "${fromState}" when applying "${event}" (lost a race, or already moved on)`,
    );
  }
}

const OPEN_DEADLINE_STATUSES = ["Not Started", "In Progress", "Submitted", "Overdue"] as const;

const SCHEDULE_EMPTY_MESSAGES: Record<ScheduleTimeWindow, string> = {
  today: "You have nothing due today.",
  tomorrow: "You have nothing due tomorrow.",
  week: "You have nothing due this week.",
  unscoped: "You have nothing upcoming.",
};

async function runUpcomingScheduleQuery(
  supabase: SupabaseClient<Database>,
  userId: string,
  timeWindow: ScheduleTimeWindow,
): Promise<string> {
  const now = new Date();
  const timezone = await loadUserTimezone(supabase, userId);
  const bounds = resolveScheduleWindowBounds(timeWindow, timezone, now);
  // todo_items.due_date is a plain `date` column (no time-of-day), so it
  // can't be filtered against the timestamp bounds above -- resolved
  // separately as calendar-date strings.
  const dateKeys = resolveScheduleWindowDateKeys(timeWindow, timezone, now);

  let deadlinesQuery = supabase
    .from("deadlines")
    .select("id, title, due_at, priority")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", OPEN_DEADLINE_STATUSES);
  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, due_at, priority")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("due_at", "is", null)
    .eq("status", "Open");
  // Previously never queried at all here -- a Course To-Do / custom-project
  // item (e.g. on a freestanding "Project: X" list) due today was
  // structurally invisible to "what is due today," even though it's exactly
  // as due as a Deadline or Task.
  let todoItemsQuery = supabase
    .from("todo_items")
    .select("id, title, due_date, priority")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("due_date", "is", null)
    .eq("is_done", false);

  if (bounds && dateKeys) {
    // A single day/week window is naturally small -- a generous sanity
    // ceiling, not a "top N" cap like the unscoped branch below.
    deadlinesQuery = deadlinesQuery.gte("due_at", bounds.startUtcIso).lt("due_at", bounds.endUtcIsoExclusive).order("due_at", { ascending: true }).limit(20);
    tasksQuery = tasksQuery.gte("due_at", bounds.startUtcIso).lt("due_at", bounds.endUtcIsoExclusive).order("due_at", { ascending: true }).limit(20);
    todoItemsQuery = todoItemsQuery
      .gte("due_date", dateKeys.startDateKey)
      .lt("due_date", dateKeys.endDateKeyExclusive)
      .order("due_date", { ascending: true })
      .limit(20);
  } else {
    // "unscoped": preserve the original next-5-of-each behavior, anchored
    // to "today" for the date-only todo_items column.
    const todayKey = resolveScheduleWindowDateKeys("today", timezone, now)!.startDateKey;
    deadlinesQuery = deadlinesQuery.gte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(5);
    tasksQuery = tasksQuery.gte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(5);
    todoItemsQuery = todoItemsQuery.gte("due_date", todayKey).order("due_date", { ascending: true }).limit(5);
  }

  const [{ data: deadlines }, { data: tasks }, { data: todoItems }] = await Promise.all([deadlinesQuery, tasksQuery, todoItemsQuery]);

  const items: ScheduleItem[] = [
    ...(deadlines ?? []).map((d): ScheduleItem => ({ id: d.id, title: d.title, dueAt: new Date(d.due_at), kind: "deadline", priority: d.priority })),
    ...(tasks ?? []).map((t): ScheduleItem => ({ id: t.id, title: t.title, dueAt: new Date(t.due_at!), kind: "task", priority: t.priority })),
    ...(todoItems ?? []).map(
      (item): ScheduleItem => ({ id: item.id, title: item.title, dueAt: new Date(`${item.due_date}T23:59:59.999`), kind: "todo", priority: item.priority }),
    ),
  ];

  const groups = rankScheduleItems(items, timezone);
  return formatScheduleAnswer(groups, { timezone, now, style: "listing", emptyMessage: SCHEDULE_EMPTY_MESSAGES[timeWindow] });
}

/**
 * Shared by every "ask the user to try again" exit out of intakeVoiceTurn
 * (silence, a transcription/LLM failure, and a genuinely low-confidence/
 * unsupported intent) — all three follow the same Transcribing ->
 * IntentAmbiguous -> Responding transition sequence, differing only in the
 * resolved-intent fields recorded and the message spoken back.
 *
 * query_kind/schedule_time_window/error_message (supabase/migrations/
 * 0022_voice_session_diagnostics.sql) exist purely for diagnosing what a
 * given turn actually did after the fact -- e.g. telling apart "the LLM
 * resolved upcoming_schedule but confidence was too low" from "resolveIntent
 * threw" from "the transcript was blank," none of which were distinguishable
 * from the DB before this.
 */
async function respondWithClarification(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  message: string,
  resolvedIntentFields: {
    resolved_intent: string | null;
    confidence_score: number | null;
    query_kind: string | null;
    schedule_time_window: string | null;
    error_message: string | null;
  },
): Promise<VoiceTurnResult> {
  await transition(supabase, userId, sessionId, "Transcribing", "intent_ambiguous_or_low_confidence", resolvedIntentFields);
  await transition(supabase, userId, sessionId, "IntentAmbiguous", "clarification_requested", {
    ended_at: new Date().toISOString(),
  });
  return { sessionId, state: "Responding", message, needsFollowUp: true };
}

/**
 * SPEC-VOICE-005 AC-1/AC-2/AC-3, SPEC-API-005 AC-3: one press-to-talk turn,
 * start to finish within a single request except when it lands in
 * AwaitingConfirmation (which a later, separate confirm/decline request
 * resolves). transcribe/resolveIntent are injected so this can be tested
 * without a network call to Deepgram/an LLM — production callers pass
 * src/lib/voice/deepgram.ts's transcribeAudio and
 * src/lib/voice/intent.ts's resolveIntent.
 */
export async function intakeVoiceTurn(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: VoiceTurnInput,
  deps: VoiceTurnDeps,
): Promise<VoiceTurnResult> {
  const { data: created, error: insertError } = await supabase
    .from("voice_sessions")
    .insert({ user_id: userId })
    .select("id, state")
    .single();
  if (insertError) throw insertError;
  const sessionId = created.id;

  await transition(supabase, userId, sessionId, created.state, "user_initiates_capture", {});
  await transition(supabase, userId, sessionId, "Listening", "capture_ends", {});

  // NC-VOICE-003: the raw audio buffer is only ever handed to the
  // transcriber — it is never written to any column. Only the resulting
  // transcript text is persisted below.
  //
  // Architect-review finding: transcribe()/resolveIntent() are the two
  // external-network calls in this whole turn (Deepgram, then an LLM) and
  // the session is already in Transcribing by this point — with no
  // transition from Transcribing directly to Responding in SPEC-VOICE-005's
  // machine, an uncaught failure here would strand the row until the 24h
  // retention sweep. Route a failure through the same IntentAmbiguous ->
  // Responding path a genuinely-ambiguous intent takes, rather than
  // throwing — a transient STT/LLM hiccup should read to the user as "I
  // didn't catch that," not a 500.
  let transcript: string;
  let intent: ResolvedIntent;
  try {
    transcript = "transcript" in input ? input.transcript : await deps.transcribe(input.audio, input.mimetype);
    const { error: transcriptError } = await supabase
      .from("voice_sessions")
      .update({ transcript })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (transcriptError) throw transcriptError;

    // Deterministic guard, checked before the paid resolveIntent() call:
    // silence (or a transcript Deepgram couldn't get anything from) must
    // always read back as "I didn't catch that," never depend on the LLM's
    // own judgment of an empty/blank string — that's what previously let a
    // silent capture get misclassified as a real query (e.g.
    // "upcoming_schedule") and read back a full answer instead of asking
    // the user to repeat themselves.
    if (transcript.trim().length === 0) {
      return respondWithClarification(supabase, userId, sessionId, "I didn't catch that — could you try again?", {
        resolved_intent: null,
        confidence_score: null,
        query_kind: null,
        schedule_time_window: null,
        error_message: null,
      });
    }

    intent = await deps.resolveIntent(supabase, userId, transcript);
  } catch (error) {
    // Previously discarded entirely -- a failed turn left resolved_intent/
    // confidence_score both NULL with no way to tell why from the DB.
    // console.error matches this codebase's established server-side error
    // logging convention (see src/lib/api/response.ts, src/lib/voice/
    // elevenlabs.ts, etc. -- no dedicated logger module exists).
    console.error("intakeVoiceTurn: transcribe/resolveIntent failed", error);
    const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    return respondWithClarification(supabase, userId, sessionId, "Sorry, I had trouble processing that — could you try again?", {
      resolved_intent: null,
      confidence_score: null,
      query_kind: null,
      schedule_time_window: null,
      error_message: errorMessage,
    });
  }

  // A read-only intent this app can't actually answer (queryKind unset/
  // unrecognized) is routed the same way as low confidence: ask rather than
  // fabricate a completed execution. Architect-review finding: this used to
  // report `executed: true` with the LLM's own unverified prose as `data`
  // for any read-only intent other than "upcoming_schedule".
  const unsupportedReadOnlyQuery =
    intent.readOnly &&
    intent.queryKind !== "upcoming_schedule" &&
    intent.queryKind !== "knowledge_lookup" &&
    intent.queryKind !== "personalization_suggestions" &&
    intent.queryKind !== "general_conversation";
  if (!meetsConfidenceBar(intent.confidence) || unsupportedReadOnlyQuery) {
    const message = unsupportedReadOnlyQuery
      ? "I can't help with that kind of question yet — I can tell you what's coming up, though."
      : `I'm not sure I understood — could you rephrase that? (heard: "${transcript}")`;
    return respondWithClarification(supabase, userId, sessionId, message, {
      resolved_intent: intent.summary,
      confidence_score: intent.confidence,
      query_kind: intent.queryKind ?? null,
      schedule_time_window: intent.scheduleTimeWindow ?? null,
      error_message: null,
    });
  }

  await transition(supabase, userId, sessionId, "Transcribing", "intent_resolved_high_confidence", {
    resolved_intent: intent.summary,
    confidence_score: intent.confidence,
    query_kind: intent.queryKind ?? null,
    schedule_time_window: intent.scheduleTimeWindow ?? null,
  });

  if (intent.readOnly) {
    await transition(supabase, userId, sessionId, "IntentResolved", "read_only_query_resolved", {});
    // Mirrors confirmVoiceSession's execution try/catch: a query failure
    // must still land the session in Responding via execution_failed rather
    // than leaving it stuck in Executing until the 24h retention sweep
    // (code-review finding).
    try {
      // SPEC-VOICE-005 NC-VOICE-007/AC-9: knowledge_lookup follows this same
      // read_only_query_resolved path as upcoming_schedule, no confirmation.
      if (intent.queryKind === "knowledge_lookup") {
        const lookup = deps.knowledgeLookup ?? runKnowledgeLookup;
        const result = await lookup(supabase, userId, transcript);
        await transition(supabase, userId, sessionId, "Executing", "execution_completed", {
          ended_at: new Date().toISOString(),
        });
        return {
          sessionId,
          state: "Responding",
          message: result.message,
          executed: true,
          data: result.message,
          citations: result.citations,
          ...(result.extractionLabel ? { extractionLabel: result.extractionLabel } : {}),
        };
      }

      if (intent.queryKind === "general_conversation") {
        const converse = deps.generalConversation ?? runGeneralConversation;
        const result = await converse(supabase, userId, transcript);
        await transition(supabase, userId, sessionId, "Executing", "execution_completed", {
          ended_at: new Date().toISOString(),
        });
        return {
          sessionId,
          state: "Responding",
          message: result.message,
          executed: true,
          data: result.message,
        };
      }

      if (intent.queryKind === "personalization_suggestions") {
        const lookup = deps.suggestionsLookup ?? runSuggestionsLookup;
        const result = await lookup(supabase, userId);
        await transition(supabase, userId, sessionId, "Executing", "execution_completed", {
          ended_at: new Date().toISOString(),
        });
        return {
          sessionId,
          state: "Responding",
          message: result.message,
          executed: true,
          data: result.message,
          queryKind: "personalization_suggestions",
        };
      }

      const message = await runUpcomingScheduleQuery(supabase, userId, intent.scheduleTimeWindow ?? "unscoped");
      await transition(supabase, userId, sessionId, "Executing", "execution_completed", {
        ended_at: new Date().toISOString(),
      });
      return { sessionId, state: "Responding", message, executed: true, data: message };
    } catch (queryError) {
      await transition(supabase, userId, sessionId, "Executing", "execution_failed", {
        ended_at: new Date().toISOString(),
      });
      throw queryError;
    }
  }

  // intent.ts's llmResponseSchema guarantees mutation is non-null whenever
  // read_only is false (review finding: this used to be an unchecked `as
  // PendingMutation` cast that could crash on a schema-violating response).
  if (!intent.mutation) {
    throw new Error("resolveIntent resolved a mutating intent with no mutation payload");
  }
  const mutation = intent.mutation;
  let message = intent.summary;
  // SPEC-VOICE-005 AC-8/NC-VOICE-006, Tracked debt: disclose the cascade
  // scope in the prompt itself, before the user confirms — not just in the
  // post-execution result cascadeDeleteCourse later reports.
  if (mutation.targetType === "course" && mutation.operation === "delete") {
    const preview = await previewCourseDeleteCascade(supabase, userId, mutation.targetId);
    message = `${intent.summary} ${formatCascadeDisclosure(preview)}`;
  }

  await transition(supabase, userId, sessionId, "IntentResolved", "mutating_action_resolved", {
    pending_mutation: mutation,
    expires_at: computeConfirmationExpiry(),
  });
  return { sessionId, state: "AwaitingConfirmation", message };
}

export interface VoiceConfirmResult {
  executed: boolean;
  result: MutationExecutionResult;
}

/**
 * SPEC-API-005 AC-6/AC-9, SPEC-VOICE-005 AC-7, NC-VOICE-005: executes
 * exactly the persisted pending_mutation, only from AwaitingConfirmation and
 * only before expires_at.
 */
export async function confirmVoiceSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<VoiceConfirmResult> {
  const { data: session, error } = await supabase
    .from("voice_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!session) throw new VoiceSessionNotFoundError();
  if (session.state !== "AwaitingConfirmation") {
    throw new VoiceSessionInvalidStateError(`Cannot confirm from state "${session.state}"`);
  }

  if (!session.expires_at || isConfirmationExpired(session.expires_at)) {
    // Best-effort: a concurrent request may have already moved this session
    // on (e.g. also observed it as expired, or a racing decline), in which
    // case this CAS'd transition throws because fromState no longer matches
    // — that's fine, the outcome we report here is "expired" either way.
    await transition(supabase, userId, sessionId, "AwaitingConfirmation", "confirmation_window_expired", {
      pending_mutation: null,
      ended_at: new Date().toISOString(),
    }).catch(() => {});
    throw new VoiceSessionExpiredError();
  }

  // The CAS in transition() (`.eq("state", fromState)`) is what actually
  // prevents double-execution: only one of two concurrent confirm requests
  // can win this specific UPDATE (matching state = AwaitingConfirmation);
  // the loser throws VoiceSessionInvalidStateError instead of both reaching
  // executePendingMutation below (review finding — was previously a bare
  // UPDATE with no state predicate or affected-row check).
  await transition(supabase, userId, sessionId, "AwaitingConfirmation", "user_confirms", {});
  try {
    const result = await executePendingMutation(supabase, userId, session.pending_mutation as PendingMutation);
    await transition(supabase, userId, sessionId, "Executing", "execution_completed", {
      pending_mutation: null,
      ended_at: new Date().toISOString(),
    });
    return { executed: true, result };
  } catch (executionError) {
    // Architect-review finding: keep pending_mutation on a failed execution
    // (unlike the success/decline/expiry paths, which correctly clear it) —
    // it's the only record of what was attempted if a partially-applied
    // multi-step mutation needs reconciling later. Best-effort cleanup: if
    // this transition itself throws, surface the original executionError,
    // not the cleanup failure.
    await transition(supabase, userId, sessionId, "Executing", "execution_failed", {
      ended_at: new Date().toISOString(),
    }).catch(() => {});
    throw executionError;
  }
}

/** SPEC-VOICE-005 AC-5: declines and clears the pending_mutation without executing it. */
export async function declineVoiceSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<{ message: string }> {
  const { data: session, error } = await supabase
    .from("voice_sessions")
    .select("id, state")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!session) throw new VoiceSessionNotFoundError();
  if (session.state !== "AwaitingConfirmation") {
    throw new VoiceSessionInvalidStateError(`Cannot decline from state "${session.state}"`);
  }

  await transition(supabase, userId, sessionId, "AwaitingConfirmation", "user_declines", {
    pending_mutation: null,
    ended_at: new Date().toISOString(),
  });
  return { message: "Okay, I won't do that." };
}
