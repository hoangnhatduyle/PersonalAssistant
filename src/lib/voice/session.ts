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
import type { KnowledgeCitation } from "@/lib/knowledge/retrieval";
import { resolveActiveConversation } from "@/lib/voice/conversation-memory";
import { runConversationTurn, type ConversationTurnOutcome, type RunConversationTurnFn } from "@/lib/voice/conversation-core";
import { timed } from "@/lib/voice/_perf-temp";

export class VoiceSessionNotFoundError extends Error {}
export class VoiceSessionInvalidStateError extends Error {}
export class VoiceSessionExpiredError extends Error {}

export interface TranscribeFn {
  (audio: Buffer, mimetype?: string): Promise<string>;
}

export interface VoiceTurnDeps {
  transcribe: TranscribeFn;
  /** Defaults to src/lib/voice/conversation-core.ts's runConversationTurn when omitted. */
  runConversationTurn?: RunConversationTurnFn;
}

export type VoiceTurnInput = { audio: Buffer; mimetype?: string } | { transcript: string };

export interface VoiceTurnResult {
  sessionId: string;
  state: "AwaitingConfirmation" | "Responding";
  message: string;
  executed?: boolean;
  data?: unknown;
  /** SPEC-API-008 VoiceTurnResult (extended): set when the conversational core's lookup_knowledge tool fired this turn. */
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

/**
 * Shared by every "ask the user to try again" exit out of intakeVoiceTurn
 * (silence, a transcription/LLM failure, and a genuinely low-confidence
 * mutation) — all three follow the same Transcribing -> IntentAmbiguous ->
 * Responding transition sequence, differing only in the resolved-intent
 * fields recorded and the message spoken back.
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
 * resolves). transcribe/runConversationTurn are injected so this can be
 * tested without a network call to Deepgram/an LLM — production callers
 * pass src/lib/voice/deepgram.ts's transcribeAudio and
 * src/lib/voice/conversation-core.ts's runConversationTurn (the default
 * when runConversationTurn is omitted from deps).
 */
// TEMPORARY perf diagnostic wrapper — see _perf-temp.ts. Wraps the real
// implementation (renamed below) purely to log total wall time across every
// return path without restructuring each one.
export async function intakeVoiceTurn(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: VoiceTurnInput,
  deps: VoiceTurnDeps,
): Promise<VoiceTurnResult> {
  const start = Date.now();
  try {
    return await intakeVoiceTurnInner(supabase, userId, input, deps);
  } finally {
    console.log(`[perf] intakeVoiceTurn total: ${Date.now() - start}ms`);
  }
}

async function intakeVoiceTurnInner(
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
  // Architect-review finding, extended by the 2h merge: transcribe() and
  // the single merged runConversationTurn() call (STT, then the one LLM
  // call that now decides mutation-vs-read-only AND either answers or
  // proposes a mutation) are the external-network calls in this whole turn,
  // and the session is already in Transcribing by this point — with no
  // transition from Transcribing directly to Responding in SPEC-VOICE-005's
  // machine, an uncaught failure here would strand the row until the 24h
  // retention sweep. Route a failure through the same IntentAmbiguous ->
  // Responding path a genuinely-ambiguous intent takes, rather than
  // throwing — a transient STT/LLM/downstream-tool hiccup should read to
  // the user as "I didn't catch that," not a 500. (Confirmed tradeoff: this
  // deliberately no longer distinguishes a plain model hiccup from a
  // genuine backend/DB error inside a data tool the model called — both
  // read identically to the user now, matching this stage's own state-
  // machine semantics; the real error is still logged server-side below
  // either way.)
  let transcript: string;
  let outcome: ConversationTurnOutcome;
  try {
    transcript =
      "transcript" in input ? input.transcript : await timed("transcribe (STT)", () => deps.transcribe(input.audio, input.mimetype));
    const { error: transcriptError } = await supabase
      .from("voice_sessions")
      .update({ transcript })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (transcriptError) throw transcriptError;

    // Deterministic guard, checked before the paid model call: silence (or
    // a transcript Deepgram couldn't get anything from) must always read
    // back as "I didn't catch that," never depend on the LLM's own
    // judgment of an empty/blank string — that's what previously let a
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

    // Conversations are scoped per user account (2a) and the core may
    // itself close/replace the active one mid-turn (the start_new_conversation
    // tool) -- always persist outcome.conversationId, not the id this call
    // started with, or the very turn that triggered a reset would file
    // itself under the now-closed conversation and corrupt the next turn's
    // history lookup.
    const { conversationId } = await resolveActiveConversation(supabase, userId);
    outcome = await timed("runConversationTurn (merged LLM call)", () =>
      (deps.runConversationTurn ?? runConversationTurn)(supabase, userId, transcript, conversationId),
    );
  } catch (error) {
    // Previously discarded entirely -- a failed turn left resolved_intent/
    // confidence_score both NULL with no way to tell why from the DB.
    // console.error matches this codebase's established server-side error
    // logging convention (see src/lib/api/response.ts, src/lib/voice/
    // elevenlabs.ts, etc. -- no dedicated logger module exists).
    console.error("intakeVoiceTurn: transcribe/runConversationTurn failed", error);
    const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    return respondWithClarification(supabase, userId, sessionId, "Sorry, I had trouble processing that — could you try again?", {
      resolved_intent: null,
      confidence_score: null,
      query_kind: null,
      schedule_time_window: null,
      error_message: errorMessage,
    });
  }

  if (outcome.kind === "answer") {
    // query_kind/schedule_time_window stay null for every new row going
    // forward — routing responsibility moved to conversation-core.ts's own
    // tool-calling loop, so there's no longer a pre-classified query kind to
    // record here. The columns stay in the schema, diagnostic-only, per
    // 0022_voice_session_diagnostics.sql's own framing. resolved_intent/
    // confidence_score also stay null: a plain answer no longer carries a
    // numeric confidence the way a mutation proposal does.
    await transition(supabase, userId, sessionId, "Transcribing", "intent_resolved_high_confidence", {
      resolved_intent: null,
      confidence_score: null,
    });
    await transition(supabase, userId, sessionId, "IntentResolved", "read_only_query_resolved", {});
    // Mirrors confirmVoiceSession's execution try/catch: a failure writing
    // this specific transition must still land the session in Responding
    // via execution_failed rather than leaving it stuck in Executing until
    // the 24h retention sweep (code-review finding). This is purely a
    // DB-write boundary now, not a model-call boundary — the model call
    // itself already succeeded by this point (its own failures are handled
    // by the outer try/catch above).
    try {
      await transition(supabase, userId, sessionId, "Executing", "execution_completed", {
        ended_at: new Date().toISOString(),
        conversation_id: outcome.conversationId,
        response_message: outcome.message,
      });
    } catch (writeError) {
      await transition(supabase, userId, sessionId, "Executing", "execution_failed", {
        ended_at: new Date().toISOString(),
      }).catch(() => {});
      throw writeError;
    }
    return {
      sessionId,
      state: "Responding",
      message: outcome.message,
      executed: true,
      data: outcome.message,
      citations: outcome.citations,
      extractionLabel: outcome.extractionLabel,
      needsFollowUp: outcome.needsFollowUp,
      ...(outcome.usedPersonalizationSuggestions ? { queryKind: "personalization_suggestions" as const } : {}),
    };
  }

  // outcome.kind === "mutation_proposal" from here down. The confidence bar
  // gates only this branch — a plain answer always proceeds regardless of
  // confidence (per the "fully conversational" decision, unchanged by the
  // merge). outcome.confidence is still persisted to confidence_score
  // below either way, for diagnostics.
  if (!meetsConfidenceBar(outcome.confidence)) {
    return respondWithClarification(supabase, userId, sessionId, `I'm not sure I understood — could you rephrase that? (heard: "${transcript}")`, {
      resolved_intent: outcome.summary,
      confidence_score: outcome.confidence,
      query_kind: null,
      schedule_time_window: null,
      error_message: null,
    });
  }

  await transition(supabase, userId, sessionId, "Transcribing", "intent_resolved_high_confidence", {
    resolved_intent: outcome.summary,
    confidence_score: outcome.confidence,
  });

  const mutation = outcome.mutation;
  let message = outcome.summary;
  // SPEC-VOICE-005 AC-8/NC-VOICE-006, Tracked debt: disclose the cascade
  // scope in the prompt itself, before the user confirms — not just in the
  // post-execution result cascadeDeleteCourse later reports.
  if (mutation.targetType === "course" && mutation.operation === "delete") {
    const preview = await previewCourseDeleteCascade(supabase, userId, mutation.targetId);
    message = `${outcome.summary} ${formatCascadeDisclosure(preview)}`;
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
