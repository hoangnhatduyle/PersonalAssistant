"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { CallScreen } from "@/components/driving/CallScreen";
import { CallDebugOverlay } from "@/components/driving/CallDebugOverlay";
import { useToast } from "@/components/ui/Toast";
import { useRealtimeCall, type UseRealtimeCall } from "@/hooks/useRealtimeCall";
import { useConfirmVoiceTurn, useDeclineVoiceTurn } from "@/hooks/useVoiceTurn";
import { useCallDebugEnabled } from "@/hooks/useCallDebugEnabled";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { startRingback } from "@/lib/voice/ringback";
import { END_REASON_LABEL } from "@/lib/voice/realtime/end-reason-labels";

/**
 * The one voice call the app can have, lifted out of Driving Mode so it can be started from the header on any
 * page and survives moving between pages. It owns everything that used to live in CallPanel: the call itself,
 * the ring tone, the tap-to-confirm handling, and the full-screen call view (portalled to <body>, so no
 * ancestor's transform or filter can pin it to a smaller box).
 */
export interface CallContextValue extends UseRealtimeCall {
  /** Connecting, live or ending: the call holds the microphone and the audio output. */
  inCall: boolean;
  /** The call is running but its full-screen view is tucked away, so the user can use the app. */
  minimized: boolean;
  setMinimized: (minimized: boolean) => void;
}

const CallContext = createContext<CallContextValue | null>(null);
// Separate from the full value on purpose: the snapshot changes every second during a call, and the many
// components that only need to know "is a call on?" (the capture mic, Driving Mode) should not re-render for it.
const InCallContext = createContext<boolean>(false);

export function RealtimeCallProvider({ children }: { children: ReactNode }) {
  const call = useRealtimeCall();
  const { snapshot, start: startCall, reportScreenDecision } = call;
  const confirmTurn = useConfirmVoiceTurn();
  const declineTurn = useDeclineVoiceTurn();
  const { showToast } = useToast();
  // Null outside the Next router (component tests), which is simply "not Driving Mode".
  const pathname = usePathname() ?? "";
  const onDrivingPage = pathname.startsWith("/driving");
  const debug = useCallDebugEnabled();
  // A phone can lock its screen and end the call; a desktop has no such risk, so it never shows the warning.
  const isTouchDevice = useMediaQuery("(pointer: coarse)");
  const [wantsMinimized, setWantsMinimized] = useState(false);

  const inCall = snapshot.phase === "connecting" || snapshot.phase === "live" || snapshot.phase === "ending";
  // Driving Mode has no header to bring the call back from, so it is never minimized there.
  const minimized = wantsMinimized && inCall && !onDrivingPage;

  // The ring is started inside the tap (iOS only plays sound begun by a user gesture) and runs
  // while the call is connecting; anything else, live, failed or ended, silences it.
  const stopRingback = useRef<(() => void) | null>(null);
  const start = useCallback(() => {
    stopRingback.current?.();
    stopRingback.current = startRingback();
    setWantsMinimized(false);
    startCall();
  }, [startCall]);
  useEffect(() => {
    if (snapshot.phase === "connecting") return;
    stopRingback.current?.();
    stopRingback.current = null;
  }, [snapshot.phase]);
  useEffect(() => () => stopRingback.current?.(), []);

  // Driving Mode's panel shows why a call ended inline; everywhere else there is no such surface, so say it once as a toast.
  const previousPhase = useRef(snapshot.phase);
  useEffect(() => {
    const justEnded = previousPhase.current !== "ended" && snapshot.phase === "ended";
    previousPhase.current = snapshot.phase;
    if (!justEnded || onDrivingPage) return;
    const note = snapshot.error ?? END_REASON_LABEL[snapshot.endReason ?? ""];
    if (note) showToast(note, snapshot.error ? "error" : "info");
  }, [snapshot.phase, snapshot.error, snapshot.endReason, onDrivingPage, showToast]);

  const handleDecision = async (outcome: "executed" | "declined") => {
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

  const value = useMemo<CallContextValue>(
    () => ({ ...call, start, inCall, minimized, setMinimized: setWantsMinimized }),
    [call, start, inCall, minimized],
  );

  return (
    <CallContext value={value}>
      <InCallContext value={inCall}>
        {children}
        {inCall && !minimized
          ? createPortal(
              <CallScreen
                snapshot={snapshot}
                onEnd={call.end}
                onMuteChange={call.setMuted}
                onAsk={call.sendText}
                onDecision={handleDecision}
                isDeciding={confirmTurn.isPending || declineTurn.isPending}
                diagnostics={debug ? <CallDebugOverlay debug={snapshot.debug} /> : null}
                onMinimize={onDrivingPage ? undefined : () => setWantsMinimized(true)}
                showScreenLockHint={isTouchDevice}
              />,
              document.body,
            )
          : null}
      </InCallContext>
    </CallContext>
  );
}

/** The call and its controls. Throws outside the provider, like useVoiceCapture. */
export function useCall(): CallContextValue {
  const value = use(CallContext);
  if (!value) throw new Error("useCall must be used within a RealtimeCallProvider");
  return value;
}

/** Whether a call is on (false outside the provider, so components with their own tests need no provider). Does not re-render each second of a call. */
export function useIsInCall(): boolean {
  return use(InCallContext);
}
