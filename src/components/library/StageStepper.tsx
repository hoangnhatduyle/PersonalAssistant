import { ACTIVE_STATUSES, APPLICATION_STATUS_LABEL, isActiveStatus, type ApplicationStatus } from "@/lib/library/application-status";
import { APPLICATION_STATUS_TONE, toneBarClasses } from "@/lib/status-colors";

type Props = {
  status: ApplicationStatus;
  className?: string;
};

/**
 * Four-dot stepper (interested -> applied -> interviewing -> offer). Dots up
 * to the current stage are filled in the stage's tone; a closed application
 * (rejected / withdrawn) shows every dot muted plus a terminal ✕ marker.
 */
export function StageStepper({ status, className = "" }: Props) {
  const active = isActiveStatus(status);
  const currentIndex = (ACTIVE_STATUSES as readonly string[]).indexOf(status);
  const tone = toneBarClasses(APPLICATION_STATUS_TONE[status]);
  const position = active ? ` (${currentIndex + 1} of ${ACTIVE_STATUSES.length})` : "";

  return (
    <span role="img" aria-label={`Stage: ${APPLICATION_STATUS_LABEL[status]}${position}`} className={`inline-flex items-center gap-1 ${className}`}>
      {ACTIVE_STATUSES.map((stage, index) => {
        const filled = active && index <= currentIndex;
        return <span key={stage} aria-hidden="true" className={`h-1.5 w-4 rounded-full ${filled ? tone : "bg-panel-border"}`} />;
      })}
      {!active && (
        <span aria-hidden="true" className={`ml-0.5 font-mono text-[0.7rem] leading-none ${status === "rejected" ? "text-status-urgent" : "text-status-neutral"}`}>
          ✕
        </span>
      )}
    </span>
  );
}
