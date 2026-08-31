"use client";

import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { TranscriptBubble } from "@/components/assistant/TranscriptBubble";
import { AssistantResponse } from "@/components/assistant/AssistantResponse";
import { ConfirmationBar } from "@/components/assistant/ConfirmationBar";
import { useVoiceCapture, type VoiceTurnOrigin } from "@/components/assistant/VoiceCaptureProvider";
import { useVoiceTurn, type VoiceTurnClientInput } from "@/hooks/useVoiceTurn";
import { useSpeakVoiceResponse } from "@/hooks/useSpeakVoiceResponse";

type LocalStatus = "idle" | "listening" | "transcribing";

type Props = {
  compact?: boolean;
};

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-6 w-6" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Press-to-talk (MediaRecorder → Blob) and a text-fallback input both post
 * through the same useVoiceTurn() call — the server can't tell them apart
 * and doesn't need to. `compact` is used inside CaptureQuickAction's header
 * dialog, sharing this same VoiceCaptureProvider context so an in-flight
 * turn survives navigating away from and back to /assistant.
 */
export function CaptureChannel({ compact = false }: Props) {
  const { state, applyTurnResult } = useVoiceCapture();
  const { showToast } = useToast();
  const voiceTurn = useVoiceTurn();
  // Single owner of the speak mutation for this CaptureChannel instance —
  // architect-review finding: ConfirmationBar previously instantiated its
  // own useSpeakVoiceResponse(), so the Confirm/Decline speak call's
  // isPending lived on a hook instance that unmounts the moment
  // applyTurnResult() flips the shared state to "responded", desyncing it
  // from the "Speaking…"/Replay indicator AssistantResponse reads below.
  // Passing `speak` down as a prop keeps one mutation, and one isPending,
  // for every message this CaptureChannel instance ever speaks.
  const speakResponse = useSpeakVoiceResponse();
  const [localStatus, setLocalStatus] = useState<LocalStatus>("idle");
  const [textInput, setTextInput] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const submitTurn = useCallback(
    async (input: VoiceTurnClientInput, origin: VoiceTurnOrigin) => {
      setLocalStatus("transcribing");
      try {
        const result = await voiceTurn.mutateAsync(input);
        applyTurnResult(result, origin);
        // Fire-and-forget (SPEC-API-010 NC-API-SPEAK-007): a speak failure
        // must never block or undo the already-applied text state above.
        // Triggered imperatively here, not reactively off `state` — this
        // also naturally avoids double playback when both the full
        // /assistant page's CaptureChannel and the header's compact
        // CaptureQuickAction dialog are mounted simultaneously, since only
        // the instance that actually issued the request runs this handler.
        if (origin === "voice") speakResponse.speak(result.message);
      } catch {
        showToast("Could not process that — try again", "error");
      } finally {
        setLocalStatus("idle");
      }
    },
    [voiceTurn, applyTurnResult, showToast, speakResponse],
  );

  const startRecording = async () => {
    if (mediaRecorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void submitTurn({ audio: blob, mimetype: blob.type }, "voice");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setLocalStatus("listening");
    } catch {
      showToast("Microphone access is unavailable — try the text field instead", "error");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const handleTextSubmit = (event: FormEvent) => {
    event.preventDefault();
    const transcript = textInput.trim();
    if (!transcript) return;
    setTextInput("");
    void submitTurn({ transcript }, "text");
  };

  const isBusy = localStatus !== "idle";

  return (
    <GlassPanel className={`flex flex-col gap-4 ${compact ? "p-4" : "p-6"}`}>
      <div className="flex flex-col items-center gap-3 py-2">
        <button
          type="button"
          aria-pressed={localStatus === "listening"}
          aria-label="Press and hold to talk"
          disabled={localStatus === "transcribing"}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={() => localStatus === "listening" && stopRecording()}
          onTouchStart={(event) => {
            event.preventDefault();
            void startRecording();
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            stopRecording();
          }}
          className={`flex h-16 w-16 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            localStatus === "listening"
              ? "glow-urgent border-status-urgent bg-status-urgent/20 text-status-urgent"
              : "border-accent-indigo/50 bg-accent-indigo/10 text-accent-indigo hover:bg-accent-indigo/20"
          }`}
        >
          <MicIcon />
        </button>
        <p className="font-mono text-xs text-text-secondary">Press and hold to talk</p>
        {localStatus !== "idle" && <TranscriptBubble status={localStatus} />}
      </div>

      <form onSubmit={handleTextSubmit} className="flex gap-2">
        <Input
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
          placeholder="Or type a request…"
          disabled={isBusy}
          aria-label="Text fallback for voice capture"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={isBusy || textInput.trim().length === 0}>
          Send
        </Button>
      </form>

      {state.status === "awaiting-confirmation" && (
        <ConfirmationBar
          sessionId={state.sessionId}
          message={state.message}
          receivedAt={state.receivedAt}
          origin={state.origin}
          onSpeak={speakResponse.speak}
        />
      )}
      {state.status === "responded" && (
        <AssistantResponse
          message={state.message}
          citations={state.citations}
          extractionLabel={state.extractionLabel}
          isSpeaking={state.origin === "voice" ? speakResponse.isPending : undefined}
          onReplay={state.origin === "voice" ? () => speakResponse.speak(state.message) : undefined}
        />
      )}
    </GlassPanel>
  );
}
