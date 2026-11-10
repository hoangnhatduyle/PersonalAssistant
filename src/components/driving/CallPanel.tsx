"use client";

import { CallDebugOverlay } from "@/components/driving/CallDebugOverlay";
import { Button } from "@/components/ui/Button";
import { useCall } from "@/components/assistant/RealtimeCallProvider";
import { useCallDebugEnabled } from "@/hooks/useCallDebugEnabled";
import { END_REASON_LABEL } from "@/lib/voice/realtime/end-reason-labels";

/**
 * Driving Mode's "Start call" control and its after-call note. The call itself, its ring tone and its
 * full-screen view live in RealtimeCallProvider (so the same call can be started from the header and survives
 * navigation); while a call is on, that full-screen view covers this, so the panel steps aside.
 */
export function CallPanel() {
  const { snapshot, start, inCall } = useCall();
  const debug = useCallDebugEnabled();

  if (inCall) return null;

  const endedNote = snapshot.phase === "ended" ? (snapshot.error ?? END_REASON_LABEL[snapshot.endReason ?? ""] ?? null) : null;
  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" size="md" className="w-full py-6 text-xl" onClick={start}>
        {snapshot.phase === "ended" ? "Call again" : "Start call"}
      </Button>
      <p className="text-center text-xs text-text-secondary">Keep the screen on during the call. Locking it ends the call.</p>
      {endedNote ? (
        <p role="status" className={`text-center text-sm ${snapshot.error ? "text-status-urgent" : "text-text-secondary"}`}>
          {endedNote}
        </p>
      ) : null}
      {snapshot.phase === "ended" && debug ? <CallDebugOverlay debug={snapshot.debug} /> : null}
    </div>
  );
}
