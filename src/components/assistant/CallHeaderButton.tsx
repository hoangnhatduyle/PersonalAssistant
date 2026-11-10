"use client";

import { useCall } from "@/components/assistant/RealtimeCallProvider";
import { formatClock } from "@/components/driving/CallScreen";

const ICON_PROPS = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const PhoneIcon = ({ className }: { className?: string }) => (
  <svg {...ICON_PROPS} className={className}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
  </svg>
);

const BUTTON_CLASS =
  "flex h-9 items-center justify-center gap-2 rounded-control border border-panel-border bg-panel text-accent-indigo transition-colors hover:border-panel-border-hover disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The header's way into a voice call from any page. Idle, it is a phone icon that starts one; during a
 * call it becomes a live pill (a pulsing dot and the running clock) that brings the call screen back,
 * with a badge when the assistant is waiting on a change you have to confirm.
 */
export function CallHeaderButton() {
  const { snapshot, start, setMinimized, inCall, minimized } = useCall();

  if (!inCall) {
    return (
      <button type="button" onClick={start} aria-label="Call the assistant" title="Call the assistant" className={`${BUTTON_CLASS} w-9`}>
        <PhoneIcon className="h-4 w-4" />
      </button>
    );
  }

  const elapsed = Math.max(0, snapshot.maxSeconds - snapshot.secondsLeft);
  const label = snapshot.phase === "connecting" ? "Calling…" : snapshot.phase === "ending" ? "Ending…" : formatClock(elapsed);
  const needsConfirm = snapshot.pending !== null;

  return (
    <button
      type="button"
      onClick={() => setMinimized(!minimized)}
      aria-label={minimized ? "Show the call" : "Call in progress, minimize"}
      aria-pressed={!minimized}
      title={minimized ? "Show the call" : "Minimize the call"}
      className={`${BUTTON_CLASS} border-status-ok/50 px-3 text-status-ok`}
    >
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-status-ok" />
      <span className="font-mono text-xs tabular-nums">{label}</span>
      {needsConfirm ? <span className="rounded-full bg-accent-indigo px-1.5 text-[10px] font-semibold text-white">Confirm</span> : null}
    </button>
  );
}
