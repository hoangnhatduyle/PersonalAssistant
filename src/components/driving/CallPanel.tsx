"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AssistantResponse } from "@/components/assistant/AssistantResponse";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useConfirmVoiceTurn, useDeclineVoiceTurn } from "@/hooks/useVoiceTurn";
import { useRealtimeCall } from "@/hooks/useRealtimeCall";
import { useCallDiagnostics } from "@/hooks/useCallDiagnostics";
import type { CallActivity, CallDebug } from "@/lib/voice/realtime/call-controller";

const ACTIVITY_LABEL: Record<CallActivity, string> = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

const END_REASON_LABEL: Record<string, string> = {
  cap: "The call reached its time limit.",
  idle: "The call ended after a quiet minute.",
  hidden: "The call ended because the app was in the background.",
};

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** `?debug=1` or the Settings toggle: what the browser actually gave the call, and how it is performing. */
function DebugOverlay({ debug }: { debug: CallDebug }) {
  const latency = median(debug.responseLatenciesMs);
  const cachedShare = debug.usage.inputTokens > 0 ? Math.round((debug.usage.cachedInputTokens / debug.usage.inputTokens) * 100) : null;
  return (
    <GlassPanel className="grid gap-1 p-3 font-mono text-xs text-text-secondary">
      <p>
        connection {debug.connectionState} · ice {debug.iceConnectionState} · wake lock {debug.wakeLockActive ? "on" : "off"}
      </p>
      <p>
        mic {debug.micSettings ? `${debug.micSettings.sampleRate ?? "?"} Hz · echo ${String(debug.micSettings.echoCancellation)} · noise ${String(debug.micSettings.noiseSuppression)} · agc ${String(debug.micSettings.autoGainControl)}` : "—"}
      </p>
      <p>
        reply latency {latency === null ? "—" : `${latency} ms median`} ({debug.responseLatenciesMs.length} samples
        {debug.responseLatenciesMs.length > 0 ? `, last ${debug.responseLatenciesMs.at(-1)} ms` : ""})
      </p>
      <p>
        tokens in {debug.usage.inputTokens} (cached {cachedShare === null ? "—" : `${cachedShare}%`}) · out {debug.usage.outputTokens}
      </p>
    </GlassPanel>
  );
}

/**
 * `?debug=1` is read from the address bar through useSyncExternalStore (false
 * on the server) rather than useSearchParams, which would force a Suspense
 * boundary around the page for a developer-only switch. The address does not
 * change while the page is open, so there is nothing to subscribe to.
 */
const subscribeNever = () => () => undefined;
function readDebugFlag(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

interface Props {
  /** Lets the page hide the push-to-talk control while a call holds the microphone. */
  onActiveChange?: (active: boolean) => void;
}

export function CallPanel({ onActiveChange }: Props) {
  const { snapshot, start, end, setMuted, reportScreenDecision } = useRealtimeCall();
  const confirmTurn = useConfirmVoiceTurn();
  const declineTurn = useDeclineVoiceTurn();
  const debugFromAddress = useSyncExternalStore(subscribeNever, readDebugFlag, () => false);
  const [debugFromSettings] = useCallDiagnostics();
  const debug = debugFromAddress || debugFromSettings;

  const inCall = snapshot.phase === "connecting" || snapshot.phase === "live" || snapshot.phase === "ending";
  useEffect(() => {
    onActiveChange?.(inCall);
  }, [inCall, onActiveChange]);

  const handleTap = async (outcome: "executed" | "declined") => {
    const pending = snapshot.pending;
    if (!pending) return;
    try {
      if (outcome === "executed") {
        const confirmed = await confirmTurn.mutateAsync(pending.sessionId);
        reportScreenDecision({ outcome, summary: confirmed.result.summary });
      } else {
        const declined = await declineTurn.mutateAsync(pending.sessionId);
        reportScreenDecision({ outcome, summary: declined.message });
      }
    } catch {
      // Expired or already handled (for example by voice); the model is told nothing, and the card stays until the call moves on.
    }
  };

  if (snapshot.phase === "idle" || snapshot.phase === "ended") {
    const endedNote = snapshot.phase === "ended" ? (snapshot.error ?? END_REASON_LABEL[snapshot.endReason ?? ""] ?? null) : null;
    return (
      <div className="flex flex-col gap-3">
        <Button variant="primary" size="md" className="w-full py-6 text-xl" onClick={start}>
          {snapshot.phase === "ended" ? "Call again" : "Start call"}
        </Button>
        {endedNote ? (
          <p role="status" className={`text-center text-sm ${snapshot.error ? "text-status-urgent" : "text-text-secondary"}`}>
            {endedNote}
          </p>
        ) : null}
        {snapshot.phase === "ended" && debug ? <DebugOverlay debug={snapshot.debug} /> : null}
      </div>
    );
  }

  const busyTapping = confirmTurn.isPending || declineTurn.isPending;
  return (
    <div className="flex flex-col gap-4">
      <GlassPanel className="flex items-center justify-between gap-4 p-4">
        <div className="flex flex-col">
          <span className="font-display text-xl font-semibold text-text-primary" aria-live="polite">
            {snapshot.phase === "connecting" ? "Connecting…" : snapshot.phase === "ending" ? "Ending…" : ACTIVITY_LABEL[snapshot.activity]}
          </span>
          {snapshot.phase === "live" ? <span className="text-sm text-text-secondary">{formatClock(snapshot.secondsLeft)} left</span> : null}
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="md" className="px-6 py-3 text-base" onClick={() => setMuted(!snapshot.muted)} disabled={snapshot.phase !== "live"} aria-pressed={snapshot.muted}>
            {snapshot.muted ? "Unmute" : "Mute"}
          </Button>
          <Button variant="destructive" size="md" className="px-6 py-3 text-base" onClick={end} disabled={snapshot.phase === "ending"}>
            End call
          </Button>
        </div>
      </GlassPanel>

      {snapshot.userLine ? (
        <p className="px-1 text-sm text-text-secondary">
          <span className="text-text-eyebrow">You: </span>
          {snapshot.userLine}
        </p>
      ) : null}
      {snapshot.assistantLine ? <AssistantResponse message={snapshot.assistantLine} citations={snapshot.citations} extractionLabel={snapshot.extractionLabel ?? undefined} /> : null}

      {snapshot.pending ? (
        <GlassPanel className="flex flex-col gap-3 p-4">
          <p className="text-base text-text-primary">{snapshot.pending.summary}</p>
          <p className="text-sm text-text-secondary">
            {snapshot.pending.requiresTap ? "This one needs you to tap Confirm." : "Say yes or no, or tap a button."}
          </p>
          <div className="flex gap-3">
            <Button variant="success" size="md" className="flex-1 py-4 text-lg" onClick={() => handleTap("executed")} disabled={busyTapping}>
              Confirm
            </Button>
            <Button variant="secondary" size="md" className="flex-1 py-4 text-lg" onClick={() => handleTap("declined")} disabled={busyTapping}>
              Cancel
            </Button>
          </div>
        </GlassPanel>
      ) : null}

      {debug ? <DebugOverlay debug={snapshot.debug} /> : null}
    </div>
  );
}
