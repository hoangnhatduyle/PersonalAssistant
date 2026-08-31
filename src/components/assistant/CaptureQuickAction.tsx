"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { CaptureChannel, MicIcon } from "@/components/assistant/CaptureChannel";

/** Header button opening a compact capture dialog — shares VoiceCaptureProvider context with /assistant, so state persists across open/close/navigate. */
export function CaptureQuickAction() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open quick capture"
        className="flex h-9 w-9 items-center justify-center rounded-control border border-panel-border bg-panel text-accent-indigo transition-colors hover:border-panel-border-hover"
      >
        <MicIcon />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Quick capture">
        <CaptureChannel compact />
      </Dialog>
    </>
  );
}
