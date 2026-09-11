"use client";

import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useVoiceCapture, type VoiceTurnOrigin } from "@/components/assistant/VoiceCaptureProvider";
import { useConfirmVoiceTurn, useDeclineVoiceTurn, useExpireVoiceTurn } from "@/hooks/useVoiceTurn";
import { useAutoStopRecorder } from "@/hooks/useAutoStopRecorder";
import { apiFetch } from "@/lib/http/client";
import { classifyYesNo } from "@/lib/voice/yes-no";
import { CONFIRMATION_WINDOW_SECONDS } from "@/lib/voice/transitions";
import { CONFIRM_MAX_DURATION_MS, CONFIRM_SILENCE_MS } from "@/lib/voice/constants";
import { playStaticAudio } from "@/lib/voice/play-audio";
import type { VoiceTranscribeResponse } from "@/app/api/voice/transcribe/route";

type Props = {
  sessionId: string;
  message: string;
  receivedAt: number;
  origin: VoiceTurnOrigin;
  /**
   * Speaks the Confirm/Decline outcome's message when origin === "voice",
   * awaiting full playback before resolving. Owned by the parent
   * CaptureChannel (its single useSpeakVoiceResponse instance, and the one
   * place that decides what happens after any spoken message finishes —
   * see that file).
   */
  onSpoken: (text: string) => Promise<void>;
  /** True once CaptureChannel has finished speaking the confirmation prompt for a voice-originated turn — the earliest moment it's safe to start listening for a spoken yes/no without talking over itself. */
  readyToListen: boolean;
};

const WINDOW_MS = CONFIRMATION_WINDOW_SECONDS * 1_000;
// Generated via scripts/generate-expired-confirmation.mjs -- keep this text
// in sync with that script's TEXT constant.
const EXPIRED_AUDIO_URL = "/sounds/confirmation-expired.mp3";
const EXPIRED_MESSAGE = "I didn't hear back, so I didn't make that change. Let me know if you'd like anything else.";

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The countdown is purely a client-computed display (POST /api/voice
 * returns no expires_at, and there's no GET route to poll) — the server
 * remains the actual authority. A confirm/decline call that fails because
 * the window already expired server-side surfaces that error via toast and
 * resets to idle, rather than the client unilaterally deciding it's expired.
 */
export function ConfirmationBar({ sessionId, message, receivedAt, origin, onSpoken, readyToListen }: Props) {
  const { applyTurnResult, reset } = useVoiceCapture();
  const { showToast } = useToast();
  const confirmTurn = useConfirmVoiceTurn();
  const declineTurn = useDeclineVoiceTurn();
  const expireTurn = useExpireVoiceTurn();
  const [remainingMs, setRemainingMs] = useState(() => WINDOW_MS - (Date.now() - receivedAt));

  useEffect(() => {
    const interval = setInterval(() => setRemainingMs(WINDOW_MS - (Date.now() - receivedAt)), 1000);
    return () => clearInterval(interval);
  }, [receivedAt]);

  const hasExpired = remainingMs <= 0;

  // Voice-only: a text-mode session just keeps showing the "Confirmation
  // window expired" label below and a still-clickable Decline button, which
  // is enough since the user is already looking at the screen. A
  // voice-origin session gets no such visual cue if the user has walked
  // away, so this speaks up instead. Gated on the server's own `expired`
  // flag (not just the local countdown) so a Confirm/Decline click that
  // wins a close race is never overwritten by this — expireVoiceSession
  // only reports expired: true when nothing else resolved the session
  // first.
  useEffect(() => {
    if (!hasExpired || origin !== "voice") return;
    let cancelled = false;
    (async () => {
      let expired = false;
      try {
        const result = await expireTurn.mutateAsync(sessionId);
        expired = result.expired;
      } catch {
        // Best-effort -- if this fails, fall through without speaking a
        // message that might not reflect what actually happened.
      }
      if (cancelled || !expired) return;
      try {
        await playStaticAudio(EXPIRED_AUDIO_URL);
      } catch {
        // Non-fatal -- the text response below still lands either way.
      }
      if (cancelled) return;
      applyTurnResult({ sessionId, state: "Responding", message: EXPIRED_MESSAGE }, origin);
    })();
    return () => {
      cancelled = true;
    };
    // sessionId/origin are stable for this component's whole lifetime (a
    // fresh AwaitingConfirmation always mounts a new ConfirmationBar) --
    // same justification as the readyToListen effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExpired]);

  const handleFailure = (error: unknown) => {
    showToast(error instanceof Error ? error.message : "That confirmation is no longer valid", "error");
    reset();
  };

  const handleConfirm = async () => {
    try {
      const { result } = await confirmTurn.mutateAsync(sessionId);
      const cascadeSuffix = result.cascade
        ? ` ${result.cascade.deadlinesDeleted} deadline(s) deleted, ${result.cascade.remindersDismissed} reminder(s) dismissed, ${result.cascade.notesUnlinked} note(s) unlinked.`
        : "";
      const responseMessage = `${result.summary}${cascadeSuffix}`;
      applyTurnResult({ sessionId, state: "Responding", message: responseMessage }, origin);
      if (origin === "voice") void onSpoken(responseMessage);
    } catch (error) {
      handleFailure(error);
    }
  };

  const handleDecline = async () => {
    try {
      const declined = await declineTurn.mutateAsync(sessionId);
      applyTurnResult({ sessionId, state: "Responding", message: declined.message }, origin);
      if (origin === "voice") void onSpoken(declined.message);
    } catch (error) {
      handleFailure(error);
    }
  };

  // Spoken yes/no: no LLM call, no retry-prompt loop for v1 — an
  // unrecognized or absent answer just leaves the Confirm/Decline buttons
  // tappable, same as if this effect never ran.
  const { status: listenStatus, start: startListening } = useAutoStopRecorder(
    async (blob) => {
      try {
        const { data } = await apiFetch<VoiceTranscribeResponse>("/api/voice/transcribe", {
          method: "POST",
          body: blob,
          headers: { "Content-Type": blob.type },
        });
        const answer = classifyYesNo(data.transcript);
        if (answer === "yes") void handleConfirm();
        else if (answer === "no") void handleDecline();
        else showToast("Didn't catch a yes or no — tap Confirm or Decline.", "info");
      } catch {
        // Silent — this is a background convenience listen, not a user-initiated action; buttons remain available.
      }
    },
    { silenceMs: CONFIRM_SILENCE_MS, maxDurationMs: CONFIRM_MAX_DURATION_MS },
  );

  useEffect(() => {
    if (!readyToListen) return;
    void startListening().catch(() => {
      // Mic unavailable/denied — no toast here (background convenience listen); buttons remain available.
    });
    // Only re-run when readyToListen flips true for a fresh prompt; startListening's identity is stable across the options object it closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToListen]);

  return (
    <GlassPanel variant="glow-warn" className="flex flex-col gap-3 p-4">
      <p className="text-sm text-text-primary">{message}</p>
      {listenStatus === "listening" && (
        <p className="text-xs text-accent-teal" role="status">
          Listening for yes or no…
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-text-secondary">
          {hasExpired ? "Confirmation window expired" : `Expires in ${formatCountdown(remainingMs)}`}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleDecline}
            isLoading={declineTurn.isPending}
            disabled={confirmTurn.isPending}
          >
            Decline
          </Button>
          <Button size="sm" onClick={handleConfirm} isLoading={confirmTurn.isPending} disabled={declineTurn.isPending || hasExpired}>
            Confirm
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}
