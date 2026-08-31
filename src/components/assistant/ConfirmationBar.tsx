"use client";

import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useVoiceCapture, type VoiceTurnOrigin } from "@/components/assistant/VoiceCaptureProvider";
import { useConfirmVoiceTurn, useDeclineVoiceTurn } from "@/hooks/useVoiceTurn";
import { CONFIRMATION_WINDOW_MINUTES } from "@/lib/voice/transitions";

type Props = {
  sessionId: string;
  message: string;
  receivedAt: number;
  origin: VoiceTurnOrigin;
  /** Called with the Confirm/Decline outcome's message when origin === "voice". Owned by the parent CaptureChannel (its single useSpeakVoiceResponse instance) — see that file for why. */
  onSpeak: (text: string) => void;
};

const WINDOW_MS = CONFIRMATION_WINDOW_MINUTES * 60_000;

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
export function ConfirmationBar({ sessionId, message, receivedAt, origin, onSpeak }: Props) {
  const { applyTurnResult, reset } = useVoiceCapture();
  const { showToast } = useToast();
  const confirmTurn = useConfirmVoiceTurn();
  const declineTurn = useDeclineVoiceTurn();
  const [remainingMs, setRemainingMs] = useState(() => WINDOW_MS - (Date.now() - receivedAt));

  useEffect(() => {
    const interval = setInterval(() => setRemainingMs(WINDOW_MS - (Date.now() - receivedAt)), 1000);
    return () => clearInterval(interval);
  }, [receivedAt]);

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
      if (origin === "voice") onSpeak(responseMessage);
    } catch (error) {
      handleFailure(error);
    }
  };

  const handleDecline = async () => {
    try {
      const declined = await declineTurn.mutateAsync(sessionId);
      applyTurnResult({ sessionId, state: "Responding", message: declined.message }, origin);
      if (origin === "voice") onSpeak(declined.message);
    } catch (error) {
      handleFailure(error);
    }
  };

  const hasExpired = remainingMs <= 0;

  return (
    <GlassPanel variant="glow-warn" className="flex flex-col gap-3 p-4">
      <p className="text-sm text-text-primary">{message}</p>
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
