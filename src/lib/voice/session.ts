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
import type { ResolveIntentFn, ResolvedIntent } from "@/lib/voice/intent";

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
}

export type VoiceTurnInput = { audio: Buffer; mimetype?: string } | { transcript: string };

export interface VoiceTurnResult {
  sessionId: string;
  state: "AwaitingConfirmation" | "Responding";
  message: string;
  executed?: boolean;
  data?: unknown;
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

async function runUpcomingScheduleQuery(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const now = new Date().toISOString();
  const [{ data: deadlines }, { data: tasks }] = await Promise.all([
    supabase
      .from("deadlines")
      .select("title, due_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(5),
    supabase
      .from("tasks")
      .select("title, due_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("due_at", "is", null)
      .gte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(5),
  ]);

  const items = [
    ...(deadlines ?? []).map((d) => `${d.title} (due ${d.due_at})`),
    ...(tasks ?? []).map((t) => `${t.title} (due ${t.due_at})`),
  ];
  return items.length === 0 ? "You have nothing upcoming." : `Coming up: ${items.join("; ")}.`;
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

    intent = await deps.resolveIntent(supabase, userId, transcript);
  } catch {
    await transition(supabase, userId, sessionId, "Transcribing", "intent_ambiguous_or_low_confidence", {
      resolved_intent: null,
      confidence_score: null,
    });
    await transition(supabase, userId, sessionId, "IntentAmbiguous", "clarification_requested", {
      ended_at: new Date().toISOString(),
    });
    return { sessionId, state: "Responding", message: "Sorry, I had trouble processing that — could you try again?" };
  }

  // A read-only intent this app can't actually answer (queryKind unset/
  // unrecognized) is routed the same way as low confidence: ask rather than
  // fabricate a completed execution. Architect-review finding: this used to
  // report `executed: true` with the LLM's own unverified prose as `data`
  // for any read-only intent other than "upcoming_schedule".
  const unsupportedReadOnlyQuery = intent.readOnly && intent.queryKind !== "upcoming_schedule";
  if (!meetsConfidenceBar(intent.confidence) || unsupportedReadOnlyQuery) {
    await transition(supabase, userId, sessionId, "Transcribing", "intent_ambiguous_or_low_confidence", {
      resolved_intent: intent.summary,
      confidence_score: intent.confidence,
    });
    await transition(supabase, userId, sessionId, "IntentAmbiguous", "clarification_requested", {
      ended_at: new Date().toISOString(),
    });
    const message = unsupportedReadOnlyQuery
      ? "I can't help with that kind of question yet — I can tell you what's coming up, though."
      : `I'm not sure I understood — could you rephrase that? (heard: "${transcript}")`;
    return { sessionId, state: "Responding", message };
  }

  await transition(supabase, userId, sessionId, "Transcribing", "intent_resolved_high_confidence", {
    resolved_intent: intent.summary,
    confidence_score: intent.confidence,
  });

  if (intent.readOnly) {
    await transition(supabase, userId, sessionId, "IntentResolved", "read_only_query_resolved", {});
    // Mirrors confirmVoiceSession's execution try/catch: a query failure
    // must still land the session in Responding via execution_failed rather
    // than leaving it stuck in Executing until the 24h retention sweep
    // (code-review finding).
    try {
      const message = await runUpcomingScheduleQuery(supabase, userId);
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
