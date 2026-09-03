"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { TranscriptBubble } from "@/components/assistant/TranscriptBubble";
import { AssistantResponse } from "@/components/assistant/AssistantResponse";
import { ConfirmationBar } from "@/components/assistant/ConfirmationBar";
import { useVoiceCapture, type VoiceTurnOrigin } from "@/components/assistant/VoiceCaptureProvider";
import { useVoiceTurn, type VoiceTurnClientInput } from "@/hooks/useVoiceTurn";
import { useSpeakVoiceResponse } from "@/hooks/useSpeakVoiceResponse";
import { useResetVoiceConversation } from "@/hooks/useResetVoiceConversation";
import { useAutoStopRecorder } from "@/hooks/useAutoStopRecorder";
import { unlockAudioPlayback } from "@/lib/voice/play-audio";
import { useSettings } from "@/hooks/useSettings";
import { usePersonalizationSuggestions } from "@/hooks/usePersonalizationSuggestions";
import { useReviewSuggestionsAloud } from "@/hooks/useReviewSuggestionsAloud";

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

function NewConversationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15-6.7M21 12a9 9 0 0 1-15 6.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 3v5h-5M7 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const GENERIC_MIC_ERROR = "Microphone access is unavailable — try the text field instead";
const DENIED_MIC_ERROR = "Microphone access is blocked — check Settings > Cadence > Microphone on your device";

/**
 * Distinguishes a hard permission denial from any other getUserMedia
 * failure (transient hardware error, no device, etc.) so the toast can
 * point at Settings only when that's actually the fix. Not every browser
 * implements querying the "microphone" permission name, so this is
 * best-effort — unsupported or erroring falls back to the generic message.
 */
async function describeMicrophoneAccessError(): Promise<string> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "denied") return DENIED_MIC_ERROR;
  } catch {
    // Unsupported in this browser — fall through to the generic message.
  }
  return GENERIC_MIC_ERROR;
}

/**
 * Tap-to-talk (auto-stops on silence — see useAutoStopRecorder) and a
 * text-fallback input both post through the same useVoiceTurn() call — the
 * server can't tell them apart and doesn't need to. `compact` is used
 * inside CaptureQuickAction's header dialog, sharing this same
 * VoiceCaptureProvider context so an in-flight turn survives navigating
 * away from and back to /assistant.
 */
export function CaptureChannel({ compact = false }: Props) {
  const { state, applyTurnResult } = useVoiceCapture();
  const { showToast } = useToast();
  const voiceTurn = useVoiceTurn();
  const { data: settings } = useSettings();
  const handsFree = settings?.hands_free_voice_enabled ?? false;
  // Single owner of the speak mutation for this CaptureChannel instance —
  // architect-review finding: ConfirmationBar previously instantiated its
  // own useSpeakVoiceResponse(), so the Confirm/Decline speak call's
  // isPending lived on a hook instance that unmounts the moment
  // applyTurnResult() flips the shared state to "responded", desyncing it
  // from the "Speaking…"/Replay indicator AssistantResponse reads below.
  // Passing `speak` down as a prop keeps one mutation, and one isPending,
  // for every message this CaptureChannel instance ever speaks.
  const speakResponse = useSpeakVoiceResponse();
  const resetConversation = useResetVoiceConversation();
  const { refetch: refetchSuggestions } = usePersonalizationSuggestions({ status: ["pending"] });
  const reviewAloud = useReviewSuggestionsAloud();
  const [localStatus, setLocalStatus] = useState<LocalStatus>("idle");
  const [textInput, setTextInput] = useState("");
  // True once the AwaitingConfirmation prompt has finished being spoken —
  // the earliest moment ConfirmationBar may safely start listening for a
  // spoken yes/no without talking over itself. Reset at the top of every
  // new submitTurn so a fresh turn never inherits a stale "ready" signal.
  const [confirmationReady, setConfirmationReady] = useState(false);

  // useAutoStopRecorder's `start` (below) and speakAndMaybeResume (here)
  // reference each other — speakAndMaybeResume re-arms the mic after
  // speaking, and the recorder's onComplete submits a turn that may itself
  // call speakAndMaybeResume again. A ref breaks the circular declaration
  // order (the recorder must be constructed after submitTurn exists, but
  // speakAndMaybeResume needs to call the recorder's `start`).
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Speaks text aloud and optionally re-arms the mic for hands-free.
   * Re-arm only happens when `shouldResume` is true AND audio actually
   * played (mobile autoplay blocks silently resolve with played=false).
   */
  const speakAndMaybeResume = useCallback(
    async (text: string, shouldResume = false) => {
      let played = false;
      try {
        const result = await speakResponse.mutateAsync(text);
        played = result?.played ?? false;
      } catch {
        // Toast already surfaced by useSpeakVoiceResponse's onError.
      }
      if (handsFree && shouldResume && played) void startRecordingRef.current();
    },
    [speakResponse, handsFree],
  );

  const submitTurn = useCallback(
    async (input: VoiceTurnClientInput, origin: VoiceTurnOrigin) => {
      setLocalStatus("transcribing");
      setConfirmationReady(false);
      try {
        const result = await voiceTurn.mutateAsync(input);
        applyTurnResult(result, origin);
        // SPEC-API-010 NC-API-SPEAK-007: applyTurnResult above already
        // committed the text state, unaffected by whatever speech does
        // next. Only a voice-originated turn ever triggers TTS.
        if (origin === "voice") {
          if (result.state === "AwaitingConfirmation") {
            try {
              await speakResponse.mutateAsync(result.message);
            } catch {
              // Toast already surfaced by useSpeakVoiceResponse's onError.
            }
            setConfirmationReady(true);
          } else if (result.queryKind === "personalization_suggestions") {
            let played = false;
            try {
              const speakResult = await speakResponse.mutateAsync(result.message);
              played = speakResult?.played ?? false;
            } catch {
              // Toast already surfaced by useSpeakVoiceResponse's onError.
            }
            if (settings?.speak_suggestions_aloud) {
              const { data: fresh } = await refetchSuggestions();
              if (fresh && fresh.rows.length > 0) {
                await reviewAloud.start(fresh.rows);
              }
            }
            if (handsFree && played) void startRecordingRef.current();
          } else {
            void speakAndMaybeResume(result.message, result.needsFollowUp === true);
          }
        }
      } catch {
        showToast("Could not process that — try again", "error");
      } finally {
        setLocalStatus("idle");
      }
    },
    [voiceTurn, applyTurnResult, showToast, speakResponse, speakAndMaybeResume, refetchSuggestions, reviewAloud, handsFree],
  );

  const { status: recorderStatus, start: startRecording, stop: stopRecording } = useAutoStopRecorder((blob) => {
    void submitTurn({ audio: blob, mimetype: blob.type || "audio/webm" }, "voice");
  });
  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const handleMicClick = async () => {
    if (recorderStatus === "listening") {
      stopRecording();
      return;
    }
    unlockAudioPlayback();
    try {
      await startRecording();
    } catch {
      showToast(await describeMicrophoneAccessError(), "error");
    }
  };

  const handleTextSubmit = (event: FormEvent) => {
    event.preventDefault();
    const transcript = textInput.trim();
    if (!transcript) return;
    setTextInput("");
    void submitTurn({ transcript }, "text");
  };

  const isRecording = recorderStatus === "listening";
  const isBusy = localStatus !== "idle" || isRecording;
  const displayStatus: LocalStatus = isRecording ? "listening" : localStatus;

  return (
    <GlassPanel className={`flex flex-col gap-4 ${compact ? "p-4" : "p-6"}`}>
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            aria-pressed={isRecording}
            aria-label="Tap to talk"
            disabled={localStatus === "transcribing"}
            onClick={handleMicClick}
            className={`flex h-16 w-16 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isRecording
                ? "glow-urgent border-status-urgent bg-status-urgent/20 text-status-urgent"
                : "border-accent-indigo/50 bg-accent-indigo/10 text-accent-indigo hover:bg-accent-indigo/20"
            }`}
          >
            <MicIcon />
          </button>
          <button
            type="button"
            aria-label="New conversation"
            title="New conversation"
            disabled={resetConversation.isPending}
            onClick={() => resetConversation.mutate()}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-panel-border text-text-secondary transition-colors hover:border-accent-indigo/50 hover:text-accent-indigo disabled:cursor-not-allowed disabled:opacity-50"
          >
            <NewConversationIcon />
          </button>
        </div>
        <p className="font-mono text-xs text-text-secondary">
          {isRecording ? "Tap to stop" : "Tap to talk"}
          {handsFree && " · Hands-free on"}
        </p>
        {displayStatus !== "idle" && <TranscriptBubble status={displayStatus} />}
      </div>

      <form onSubmit={handleTextSubmit} className="flex items-end gap-2">
        <Textarea
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Or type a request…"
          disabled={isBusy}
          aria-label="Text fallback for voice capture"
          rows={compact ? 3 : 5}
          className="min-h-24 resize-y"
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
          onSpoken={speakAndMaybeResume}
          readyToListen={confirmationReady && state.origin === "voice"}
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
