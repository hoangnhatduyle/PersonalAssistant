"use client";

import { createContext, use, useCallback, useReducer } from "react";
import type { ReactNode } from "react";
import type { VoiceTurnResult } from "@/lib/voice/session";

/**
 * Shared in-flight-voice-turn state, read by both the header's
 * CaptureQuickAction and the full /assistant page's CaptureChannel (Step 8)
 * so a turn survives navigation between them. Low-frequency state (a
 * handful of discrete changes per turn, not a stream) — Context+useReducer
 * per this project's state-decision guidance, not an external store.
 */
/** Client-only concept (SPEC-API-010) — never present in the server's VoiceTurnResult. */
export type VoiceTurnOrigin = "voice" | "text";

export type VoiceCaptureState =
  | { status: "idle" }
  | { status: "awaiting-confirmation"; sessionId: string; message: string; receivedAt: number; origin: VoiceTurnOrigin }
  | {
      status: "responded";
      message: string;
      citations?: VoiceTurnResult["citations"];
      extractionLabel?: VoiceTurnResult["extractionLabel"];
      queryKind?: VoiceTurnResult["queryKind"];
      origin: VoiceTurnOrigin;
    };

type VoiceCaptureAction =
  | { type: "turn-awaiting-confirmation"; sessionId: string; message: string; origin: VoiceTurnOrigin }
  | {
      type: "turn-responded";
      message: string;
      citations?: VoiceTurnResult["citations"];
      extractionLabel?: VoiceTurnResult["extractionLabel"];
      queryKind?: VoiceTurnResult["queryKind"];
      origin: VoiceTurnOrigin;
    }
  | { type: "reset" };

function voiceCaptureReducer(_state: VoiceCaptureState, action: VoiceCaptureAction): VoiceCaptureState {
  switch (action.type) {
    case "turn-awaiting-confirmation":
      return {
        status: "awaiting-confirmation",
        sessionId: action.sessionId,
        message: action.message,
        receivedAt: Date.now(),
        origin: action.origin,
      };
    case "turn-responded":
      return {
        status: "responded",
        message: action.message,
        citations: action.citations,
        extractionLabel: action.extractionLabel,
        queryKind: action.queryKind,
        origin: action.origin,
      };
    case "reset":
      return { status: "idle" };
    default:
      return _state;
  }
}

export interface VoiceCaptureContextValue {
  state: VoiceCaptureState;
  /** Applies a POST /api/voice (or confirm/decline) turn result — routes to the right reducer action based on its `state` field. `origin` is a client-only tag, never derived from the server response. */
  applyTurnResult: (result: VoiceTurnResult, origin: VoiceTurnOrigin) => void;
  reset: () => void;
}

const VoiceCaptureContext = createContext<VoiceCaptureContextValue | null>(null);

export function VoiceCaptureProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(voiceCaptureReducer, { status: "idle" });

  const applyTurnResult = useCallback((result: VoiceTurnResult, origin: VoiceTurnOrigin) => {
    if (result.state === "AwaitingConfirmation") {
      dispatch({ type: "turn-awaiting-confirmation", sessionId: result.sessionId, message: result.message, origin });
      return;
    }
    dispatch({
      type: "turn-responded",
      message: result.message,
      citations: result.citations,
      extractionLabel: result.extractionLabel,
      queryKind: result.queryKind,
      origin,
    });
  }, []);

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return <VoiceCaptureContext value={{ state, applyTurnResult, reset }}>{children}</VoiceCaptureContext>;
}

export function useVoiceCapture(): VoiceCaptureContextValue {
  const context = use(VoiceCaptureContext);
  if (!context) throw new Error("useVoiceCapture must be used within a VoiceCaptureProvider");
  return context;
}
