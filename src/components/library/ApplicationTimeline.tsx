"use client";

import { useApplicationTimeline } from "@/hooks/useLibraryInterviews";
import { Skeleton } from "@/components/ui/Skeleton";
import { APPLICATION_STATUS_LABEL } from "@/lib/library/application-status";
import { INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOME_LABEL } from "@/lib/library/labels";
import type { LibraryTimelineEntry } from "@/lib/api/entity-types";

const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function describeEntry(entry: LibraryTimelineEntry): { title: string; detail: string | null } {
  if (entry.type === "status") {
    return entry.from_status === null
      ? { title: `Added as ${APPLICATION_STATUS_LABEL[entry.to_status]}`, detail: null }
      : { title: `Moved to ${APPLICATION_STATUS_LABEL[entry.to_status]}`, detail: `from ${APPLICATION_STATUS_LABEL[entry.from_status]}` };
  }
  const { interview } = entry;
  return {
    title: interview.round_label,
    detail: `${INTERVIEW_KIND_LABEL[interview.kind]} interview · ${INTERVIEW_OUTCOME_LABEL[interview.outcome].toLowerCase()}${interview.interviewer ? ` · with ${interview.interviewer.name}` : ""}`,
  };
}

type Props = {
  applicationId: string;
  applicationLabel: string;
};

/** Vertical rail merging the DB-written status history with the interview log, oldest first. */
export function ApplicationTimeline({ applicationId, applicationLabel }: Props) {
  const { data: timeline, isLoading, isError } = useApplicationTimeline(applicationId);

  return (
    <section aria-label={`Timeline for ${applicationLabel}`} className="flex flex-col gap-3">
      <h4 className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Timeline</h4>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <p className="text-sm text-status-urgent">Could not load the timeline.</p>
      ) : (timeline ?? []).length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing yet.</p>
      ) : (
        <ol className="dossier-rail ml-1 flex flex-col gap-3 pl-4">
          {timeline!.map((entry) => {
            const { title, detail } = describeEntry(entry);
            return (
              <li key={`${entry.type}-${entry.id}`} data-dossier-status={entry.type === "status" ? entry.to_status : "interviewing"} className="relative">
                <span aria-hidden="true" className="dossier-node" />
                <p className="text-sm font-medium text-text-primary">{title}</p>
                <p className="font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
                  {formatDay(entry.at)}
                  {detail ? ` · ${detail}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
