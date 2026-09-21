import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { StageStepper } from "@/components/library/StageStepper";
import { APPLICATION_STATUS_LABEL, daysInStage, employerSummary, isActiveStatus } from "@/lib/library/application-status";
import { displayHost } from "@/lib/library/url";
import { APPLICATION_STATUS_TONE } from "@/lib/status-colors";
import type { LibraryEmployerListItem } from "@/lib/api/entity-types";

const VISIBLE_APPLICATIONS = 3;

type Props = {
  employer: LibraryEmployerListItem;
  now?: Date;
};

/** One employer in the list: display name, mono eyebrow, a stage stepper per role, and how long the lead role has sat in its stage. */
export function EmployerCard({ employer, now }: Props) {
  const summary = employerSummary(employer.applications);
  const host = displayHost(employer.website);
  const lead = summary ? employer.applications.find((application) => application.status === summary) : undefined;
  const days = lead ? daysInStage(lead.status_changed_at, now) : null;
  const eyebrow = [
    host,
    employer.applications.length > 0 ? `${employer.applications.length} ${employer.applications.length === 1 ? "role" : "roles"}` : "No roles yet",
    employer.contacts.length > 0 ? `${employer.contacts.length} ${employer.contacts.length === 1 ? "contact" : "contacts"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      data-dossier-status={summary ?? undefined}
      data-muted={summary ? !isActiveStatus(summary) || undefined : undefined}
      className={`employer-card flex flex-col gap-3 rounded-panel border p-4 pl-5 ${employer.archived_at ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
            {eyebrow}
            {employer.archived_at ? " · archived" : ""}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold leading-tight text-text-primary">
            <Link
              href={`/library/employers/${employer.id}`}
              className="rounded-control outline-offset-4 after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-accent-indigo"
            >
              {employer.name}
            </Link>
          </h3>
        </div>
        {summary && <Badge tone={APPLICATION_STATUS_TONE[summary]}>{APPLICATION_STATUS_LABEL[summary]}</Badge>}
      </div>

      {employer.applications.length > 0 ? (
        <ul aria-label={`Roles at ${employer.name}`} className="flex flex-col gap-1.5">
          {employer.applications.slice(0, VISIBLE_APPLICATIONS).map((application) => (
            <li key={application.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-text-secondary">{application.title}</span>
              <StageStepper status={application.status} className="shrink-0" />
            </li>
          ))}
          {employer.applications.length > VISIBLE_APPLICATIONS && (
            <li className="font-mono text-[0.7rem] text-text-eyebrow">+{employer.applications.length - VISIBLE_APPLICATIONS} more</li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-text-secondary">Nothing tracked here yet.</p>
      )}

      {days !== null && summary && isActiveStatus(summary) && (
        <p className="font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">{days === 0 ? "Moved today" : `${days}d in ${APPLICATION_STATUS_LABEL[summary].toLowerCase()}`}</p>
      )}
    </article>
  );
}
