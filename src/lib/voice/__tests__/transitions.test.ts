import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_WINDOW_MINUTES,
  VOICE_CONFIDENCE_BAR,
  VOICE_FORBIDDEN_TRANSITIONS,
  computeConfirmationExpiry,
  isConfirmationExpired,
  isVoiceTransitionEvent,
  meetsConfidenceBar,
  resolveVoiceTransition,
  type VoiceTransitionEvent,
} from "../transitions";

const ALL_EVENTS: VoiceTransitionEvent[] = [
  "user_initiates_capture",
  "capture_ends",
  "intent_resolved_high_confidence",
  "intent_ambiguous_or_low_confidence",
  "clarification_requested",
  "read_only_query_resolved",
  "mutating_action_resolved",
  "user_confirms",
  "user_declines",
  "confirmation_window_expired",
  "execution_completed",
  "execution_failed",
  "response_delivered",
];

// Traces: SPEC-VOICE-005 AC-1/AC-2/AC-6/AC-7 (transition-table correctness).
describe("resolveVoiceTransition", () => {
  it("applies each legal transition", () => {
    expect(resolveVoiceTransition("user_initiates_capture", "Idle")).toBe("Listening");
    expect(resolveVoiceTransition("capture_ends", "Listening")).toBe("Transcribing");
    expect(resolveVoiceTransition("read_only_query_resolved", "IntentResolved")).toBe("Executing");
    expect(resolveVoiceTransition("mutating_action_resolved", "IntentResolved")).toBe("AwaitingConfirmation");
    expect(resolveVoiceTransition("user_confirms", "AwaitingConfirmation")).toBe("Executing");
    expect(resolveVoiceTransition("confirmation_window_expired", "AwaitingConfirmation")).toBe("Responding");
  });

  it("rejects an event that does not apply from the current state", () => {
    expect(resolveVoiceTransition("user_confirms", "Idle")).toBeNull();
    expect(resolveVoiceTransition("mutating_action_resolved", "Idle")).toBeNull();
  });

  // Traces: SPEC-VOICE-005's declared `forbidden` list (the 3 FORBID cases).
  it.each(VOICE_FORBIDDEN_TRANSITIONS)("never allows $from -> $to via any event", ({ from, to }) => {
    for (const event of ALL_EVENTS) {
      expect(resolveVoiceTransition(event, from)).not.toBe(to);
    }
  });
});

// Traces: SPEC-VOICE-005 NC-VOICE-002.
describe("meetsConfidenceBar", () => {
  it("enforces the recorded 95% first-try accuracy bar", () => {
    expect(VOICE_CONFIDENCE_BAR).toBe(0.95);
    expect(meetsConfidenceBar(0.95)).toBe(true);
    expect(meetsConfidenceBar(1)).toBe(true);
    expect(meetsConfidenceBar(0.9499)).toBe(false);
  });
});

// Traces: SPEC-VOICE-005 AC-2/AC-7, NC-VOICE-005.
describe("confirmation window", () => {
  it(`computes a fixed ${CONFIRMATION_WINDOW_MINUTES}-minute expiry from a given instant`, () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiry = computeConfirmationExpiry(now);
    expect(new Date(expiry).getTime() - now.getTime()).toBe(CONFIRMATION_WINDOW_MINUTES * 60_000);
  });

  it("treats an expires_at at or before now as expired", () => {
    expect(isConfirmationExpired("2020-01-01T00:00:00.000Z")).toBe(true);
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isConfirmationExpired(now.toISOString(), now)).toBe(true);
    expect(isConfirmationExpired(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(false);
  });
});

describe("isVoiceTransitionEvent", () => {
  it("recognizes only real voice_session events", () => {
    expect(isVoiceTransitionEvent("user_confirms")).toBe(true);
    expect(isVoiceTransitionEvent("mutating_action_resolved")).toBe(true);
    expect(isVoiceTransitionEvent("not_a_real_event")).toBe(false);
  });
});
