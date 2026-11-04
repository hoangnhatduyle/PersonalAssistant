"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AssistantResponse } from "@/components/assistant/AssistantResponse";
import type { CallActivity, CallSnapshot } from "@/lib/voice/realtime/call-controller";

/** What the Today button asks the assistant, as if the user had said it. */
export const TODAY_PROMPT = "What's on my plate today?";

/** The countdown appears for the last minute only; before that the clock just counts up. */
const COUNTDOWN_SECONDS = 60;

const ACTIVITY_LABEL: Record<CallActivity, string> = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface Props {
  snapshot: CallSnapshot;
  onEnd: () => void;
  onMuteChange: (muted: boolean) => void;
  /** A request made with a button instead of a voice. */
  onAsk: (text: string) => void;
  /** The user tapped Confirm or Cancel on a pending change. */
  onDecision: (outcome: "executed" | "declined") => void;
  /** A Confirm/Cancel tap is being carried out. */
  isDeciding: boolean;
  /** The developer diagnostics overlay, when it is switched on. */
  diagnostics?: ReactNode;
}

type IconProps = { className?: string };
const ICON_PROPS = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const MicIcon = ({ className }: IconProps) => (
  <svg {...ICON_PROPS} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const MicOffIcon = ({ className }: IconProps) => (
  <svg {...ICON_PROPS} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />
  </svg>
);
const CaptionsIcon = ({ className }: IconProps) => (
  <svg {...ICON_PROPS} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M8 11h3M13 11h3M8 15h5" />
  </svg>
);
const CalendarIcon = ({ className }: IconProps) => (
  <svg {...ICON_PROPS} className={className}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const SunIcon = ({ className }: IconProps) => (
  <svg {...ICON_PROPS} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const WarningIcon = ({ className }: IconProps) => (
  <svg {...ICON_PROPS} className={className}>
    <path d="M12 3 2 21h20L12 3Z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);
const HangUpIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M12 9c-3.6 0-6.9 1.2-9.3 3.2a1.5 1.5 0 0 0-.1 2.2l1.6 1.6c.5.5 1.3.6 1.9.2l2.3-1.5c.4-.3.7-.7.7-1.2V12c1-.3 2-.4 2.9-.4s1.9.1 2.9.4v1.5c0 .5.3.9.7 1.2l2.3 1.5c.6.4 1.4.3 1.9-.2l1.6-1.6a1.5 1.5 0 0 0-.1-2.2C18.9 10.2 15.6 9 12 9Z" />
  </svg>
);

interface ControlProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

function Control({ label, icon, onClick, disabled = false, pressed }: ControlProps) {
  const isPressed = pressed === true;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className="group flex flex-col items-center gap-1.5 text-xs font-medium text-text-secondary outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-teal disabled:cursor-default disabled:opacity-40 aria-pressed:text-text-primary"
    >
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full border transition-colors group-enabled:group-active:scale-95 ${
          isPressed ? "border-text-primary bg-text-primary text-bg-void" : "border-panel-border bg-panel text-text-primary group-enabled:group-hover:border-panel-border-hover"
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * The full-screen view of a Driving Mode call, from the moment the ring starts
 * until the call is over. It owns nothing: every state and action comes from
 * the call snapshot and the handlers CallPanel passes in.
 */
export function CallScreen({ snapshot, onEnd, onMuteChange, onAsk, onDecision, isDeciding, diagnostics }: Props) {
  const { phase, activity, muted, maxSeconds, secondsLeft, userLine, assistantLine, pending, citations, extractionLabel, debug } = snapshot;
  const [captionsOn, setCaptionsOn] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog when it opens, without pre-selecting a button (End call is one tap away).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const isConnecting = phase === "connecting";
  const isLive = phase === "live";
  const elapsed = Math.max(0, maxSeconds - secondsLeft);
  const showCountdown = isLive && maxSeconds > COUNTDOWN_SECONDS * 2 && secondsLeft <= COUNTDOWN_SECONDS;
  const wakeLockMissing = isLive && !debug.wakeLockActive;

  const statusText = isConnecting ? "Calling…" : phase === "ending" ? "Ending…" : showCountdown ? `${formatClock(elapsed)} · ${formatClock(secondsLeft)} left` : formatClock(elapsed);
  const activityText = isConnecting ? "Ringing" : isLive ? ACTIVITY_LABEL[activity] : "";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Call with Cadence"
      tabIndex={-1}
      className="fixed inset-0 z-[45] flex flex-col overflow-hidden bg-bg-void px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] outline-none"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(99_102_241/0.32),transparent_65%)]" />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <p
          className={`mx-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
            wakeLockMissing ? "border-status-warn/45 bg-status-warn/10 text-status-warn" : "border-panel-border bg-panel text-text-secondary"
          }`}
        >
          {wakeLockMissing ? <WarningIcon className="h-3.5 w-3.5 shrink-0" /> : <SunIcon className="h-3.5 w-3.5 shrink-0" />}
          {wakeLockMissing ? "Screen may lock. Keep it awake or the call ends." : "Screen stays on during the call"}
        </p>

        <div className="mt-8 flex flex-col items-center gap-1.5 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent-indigo to-accent-violet font-display text-4xl font-bold text-text-primary">
            {(isConnecting || isLive) && (
              <span aria-hidden="true" className={`call-ring absolute inset-0 rounded-full border-2 ${isConnecting ? "border-accent-teal/50" : "border-accent-indigo/50"}`} />
            )}
            C
          </div>
          <h2 className="mt-3 font-display text-2xl font-semibold text-text-primary">Cadence</h2>
          <p aria-live={showCountdown ? "polite" : "off"} className={`font-mono text-base tabular-nums tracking-wide ${showCountdown ? "text-status-warn" : "text-text-secondary"}`}>
            {statusText}
          </p>
          <p aria-live="polite" className="min-h-5 text-sm text-accent-teal">
            {activityText}
          </p>
        </div>

        {captionsOn ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-y-auto text-sm">
            {userLine ? (
              <p className="mr-8 rounded-2xl border border-panel-border bg-panel px-3 py-2 text-text-primary">
                <span className="mb-0.5 block font-mono text-[0.65rem] uppercase tracking-widest text-text-eyebrow">You</span>
                {userLine}
              </p>
            ) : null}
            {assistantLine ? (
              <div className="ml-8">
                <AssistantResponse message={assistantLine} citations={citations} extractionLabel={extractionLabel ?? undefined} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {diagnostics ? <div className="mt-3 max-h-40 overflow-y-auto">{diagnostics}</div> : null}

        {pending ? (
          <div role="group" aria-label="Pending change" className="mt-3 flex flex-col gap-2 rounded-2xl border border-accent-indigo/50 bg-bg-void-elevated p-3 shadow-[0_-12px_30px_-12px_rgb(0_0_0/0.7)]">
            <p className="text-sm text-text-primary">{pending.summary}</p>
            <p className="text-xs text-text-secondary">{pending.requiresTap ? "This one needs you to tap Confirm." : "Say yes or no, or tap a button."}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDecision("executed")}
                disabled={isDeciding}
                className="min-h-11 flex-1 rounded-control border border-accent-teal/50 bg-[#115e55] text-sm font-semibold text-text-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-teal disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => onDecision("declined")}
                disabled={isDeciding}
                className="min-h-11 flex-1 rounded-control border border-panel-border bg-panel text-sm font-semibold text-text-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-teal disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Control
            label={muted ? "Unmute" : "Mute"}
            icon={muted ? <MicOffIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
            onClick={() => onMuteChange(!muted)}
            disabled={!isLive}
            pressed={muted}
          />
          <Control label="Captions" icon={<CaptionsIcon className="h-6 w-6" />} onClick={() => setCaptionsOn((on) => !on)} disabled={!isLive} pressed={captionsOn} />
          <Control label="Today" icon={<CalendarIcon className="h-6 w-6" />} onClick={() => onAsk(TODAY_PROMPT)} disabled={!isLive || activity !== "listening"} />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onEnd}
            disabled={phase === "ending"}
            aria-label="End call"
            className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-[#ef4444] text-white shadow-[0_8px_22px_-8px_rgb(239_68_68/0.8)] outline-offset-4 transition-transform focus-visible:outline-2 focus-visible:outline-accent-teal enabled:active:scale-95 disabled:opacity-60"
          >
            <HangUpIcon className="h-8 w-8" />
          </button>
        </div>
      </div>
    </div>
  );
}
