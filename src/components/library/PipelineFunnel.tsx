import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, isActiveStatus, type ApplicationStatus } from "@/lib/library/application-status";
import { APPLICATION_STATUS_TONE, toneBarClasses } from "@/lib/status-colors";

type Props = {
  counts: Record<ApplicationStatus, number>;
  /** Highlights one status (the list's status filter). */
  activeStatus?: ApplicationStatus;
  /** When given, each status in the legend becomes a toggle button (click again to clear). */
  onSelect?: (status: ApplicationStatus | undefined) => void;
};

/**
 * The dataviz element: one segmented bar, width proportional to how many
 * applications sit in each status (semantic tone per status; closed ones
 * muted), with a labelled legend underneath that doubles as a filter.
 */
export function PipelineFunnel({ counts, activeStatus, onSelect }: Props) {
  const total = APPLICATION_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const summary = APPLICATION_STATUSES.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${APPLICATION_STATUS_LABEL[status].toLowerCase()}`)
    .join(", ");

  return (
    <section aria-label="Application pipeline" className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={total === 0 ? "No applications yet" : `Pipeline: ${summary}`}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-panel"
      >
        {APPLICATION_STATUSES.filter((status) => counts[status] > 0).map((status) => (
          <span
            key={status}
            style={{ flexGrow: counts[status] }}
            className={`min-w-1.5 ${toneBarClasses(APPLICATION_STATUS_TONE[status])} ${isActiveStatus(status) ? "" : "opacity-45"}`}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {APPLICATION_STATUSES.map((status) => {
          const isActive = activeStatus === status;
          const content = (
            <>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${toneBarClasses(APPLICATION_STATUS_TONE[status])} ${isActiveStatus(status) ? "" : "opacity-45"}`} />
              <span>{APPLICATION_STATUS_LABEL[status]}</span>
              <span className="text-text-primary">{counts[status]}</span>
            </>
          );
          const base = "inline-flex items-center gap-1.5 font-mono text-xs";
          return (
            <li key={status}>
              {onSelect ? (
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelect(isActive ? undefined : status)}
                  className={`${base} rounded-full px-1.5 py-0.5 outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent-indigo ${
                    isActive ? "bg-accent-indigo/15 text-accent-indigo" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {content}
                </button>
              ) : (
                <span className={`${base} text-text-secondary`}>{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
