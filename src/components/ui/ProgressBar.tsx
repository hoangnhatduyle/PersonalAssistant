import { toneBarClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  /** 0..1, clamped */
  value: number;
  tone?: StatusTone;
  label?: string;
  className?: string;
};

export function ProgressBar({ value, tone = "accent", label, className = "" }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-panel-border ${className}`}
    >
      <div className={`h-full rounded-full ${toneBarClasses(tone)}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
