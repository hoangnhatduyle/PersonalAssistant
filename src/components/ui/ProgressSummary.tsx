import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatEstimateHours } from "@/lib/progress/format";
import type { ProgressSource, ResolvedProgress } from "@/lib/progress/resolve-progress";

const SOURCE_LABEL: Record<ProgressSource, string> = {
  manual: "Set by you",
  "session-time": "From done sessions vs estimate",
  "session-count": "From done sessions",
  checklist: "From checklist",
  status: "From status",
  none: "",
};

type Props = {
  progress: ResolvedProgress;
  estimatedHours?: number | null;
  className?: string;
};

/** Read-only progress for a detail view: bar + percent + where it came from, the estimate, and the note. */
export function ProgressSummary({ progress, estimatedHours = null, className = "" }: Props) {
  const estimate = formatEstimateHours(estimatedHours);
  if (progress.percent == null && !estimate && !progress.note) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {progress.percent != null && (
        <>
          <div className="flex items-center justify-between gap-3 font-mono text-xs text-text-secondary">
            <span>
              <span className="text-text-primary">{progress.percent}%</span>
              {SOURCE_LABEL[progress.source] ? ` · ${SOURCE_LABEL[progress.source]}` : ""}
            </span>
            {estimate && <span>Estimate {estimate}</span>}
          </div>
          <ProgressBar value={progress.percent / 100} label="Progress" />
        </>
      )}
      {progress.percent == null && estimate && <p className="font-mono text-xs text-text-secondary">Estimate {estimate}</p>}
      {progress.note && <p className="text-sm text-text-secondary">{progress.note}</p>}
    </div>
  );
}
