"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { CaptureChannel, MicIcon } from "@/components/assistant/CaptureChannel";
import { useIsInCall } from "@/components/assistant/RealtimeCallProvider";

/** Header button opening a compact capture dialog — shares VoiceCaptureProvider context with Driving Mode, so state persists across open/close/navigate. */
export function CaptureQuickAction() {
  const [open, setOpen] = useState(false);
  // A call holds the microphone and the audio output, so quick capture (which wants both) waits until it ends.
  const inCall = useIsInCall();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={inCall}
        aria-label="Open quick capture"
        title={inCall ? "Unavailable during a call" : undefined}
        className="flex h-9 w-9 items-center justify-center rounded-control border border-panel-border bg-panel text-accent-indigo transition-colors hover:border-panel-border-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MicIcon />
      </button>
      <Dialog open={open && !inCall} onClose={() => setOpen(false)} title="Quick capture">
        <CaptureChannel compact />
      </Dialog>
    </>
  );
}
