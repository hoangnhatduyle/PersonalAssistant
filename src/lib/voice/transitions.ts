import type { Database } from "@/lib/supabase/types";

export type VoiceSessionState = Database["public"]["Enums"]["voice_session_state"];

export type VoiceTransitionEvent =
  | "user_initiates_capture"
  | "capture_ends"
  | "intent_resolved_high_confidence"
  | "intent_ambiguous_or_low_confidence"
  | "clarification_requested"
  | "read_only_query_resolved"
  | "mutating_action_resolved"
  | "user_confirms"
  | "user_declines"
  | "confirmation_window_expired"
  | "execution_completed"
  | "execution_failed"
  | "response_delivered";

// Mirrors SPEC-VOICE-005's voice_session machine exactly.
const voiceTransitions: Record<VoiceTransitionEvent, Partial<Record<VoiceSessionState, VoiceSessionState>>> = {
  user_initiates_capture: { Idle: "Listening" },
  capture_ends: { Listening: "Transcribing" },
  intent_resolved_high_confidence: { Transcribing: "IntentResolved" },
  intent_ambiguous_or_low_confidence: { Transcribing: "IntentAmbiguous" },
  clarification_requested: { IntentAmbiguous: "Responding" },
  read_only_query_resolved: { IntentResolved: "Executing" },
  mutating_action_resolved: { IntentResolved: "AwaitingConfirmation" },
  user_confirms: { AwaitingConfirmation: "Executing" },
  user_declines: { AwaitingConfirmation: "Responding" },
  confirmation_window_expired: { AwaitingConfirmation: "Responding" },
  execution_completed: { Executing: "Responding" },
  execution_failed: { Executing: "Responding" },
  response_delivered: { Responding: "Idle" },
};

// SPEC-VOICE-005's declared `forbidden` list, kept alongside the allowed
// table so a mistaken addition to voiceTransitions above can never silently
// re-open one of these (the DB trigger, SPEC-DATA-007 NC-DATA-003, is the
// backstop; this is the same defense-in-depth check the API layer applies
// for deadline/task/reminder transitions).
export const VOICE_FORBIDDEN_TRANSITIONS: ReadonlyArray<{ from: VoiceSessionState; to: VoiceSessionState }> = [
  { from: "Executing", to: "Idle" },
  { from: "Transcribing", to: "Executing" },
  { from: "Idle", to: "Executing" },
];

/**
 * Mirrors resolveDeadlineTransition/etc in src/lib/api/transitions.ts:
 * returns the resulting state, or null if `event` does not apply from
 * `currentState` — the caller rejects rather than applying an arbitrary
 * state, and this can never return one of VOICE_FORBIDDEN_TRANSITIONS'
 * pairs since those never appear in voiceTransitions above.
 */
export function resolveVoiceTransition(
  event: VoiceTransitionEvent,
  currentState: VoiceSessionState,
): VoiceSessionState | null {
  return voiceTransitions[event]?.[currentState] ?? null;
}

export function isVoiceTransitionEvent(value: string): value is VoiceTransitionEvent {
  return value in voiceTransitions;
}

/** NC-VOICE-002: the recorded ≥95% first-try intent-accuracy bar. */
export const VOICE_CONFIDENCE_BAR = 0.95;

export function meetsConfidenceBar(confidence: number): boolean {
  return confidence >= VOICE_CONFIDENCE_BAR;
}

/** SPEC-VOICE-005 AC-2/AC-7, NC-VOICE-005: the confirmation window's fixed width. */
export const CONFIRMATION_WINDOW_MINUTES = 5;

export function computeConfirmationExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + CONFIRMATION_WINDOW_MINUTES * 60_000).toISOString();
}

export function isConfirmationExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
