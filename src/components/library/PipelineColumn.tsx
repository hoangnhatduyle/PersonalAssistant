"use client";

import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/Badge";
import { PipelineCard } from "@/components/library/PipelineCard";
import { APPLICATION_STATUS_LABEL, type ApplicationStatus } from "@/lib/library/application-status";
import type { LibraryApplicationWithEmployer } from "@/lib/api/entity-types";

type Props = {
  status: ApplicationStatus;
  applications: LibraryApplicationWithEmployer[];
  onMove: (id: string, to: ApplicationStatus) => void;
  now?: Date;
};

/** One status lane of the pipeline board: a droppable region whose id is the status itself. */
export function PipelineColumn({ status, applications, onMove, now }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: "column", status } });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${APPLICATION_STATUS_LABEL[status]} applications`}
      data-dossier-status={status}
      data-over={isOver}
      className="pipeline-lane flex w-72 shrink-0 snap-start flex-col gap-3 rounded-panel border p-3"
    >
      <header className="flex items-center justify-between gap-2 pt-1">
        <h3 className="font-display text-sm font-semibold text-text-primary">{APPLICATION_STATUS_LABEL[status]}</h3>
        <Badge tone="neutral">{applications.length}</Badge>
      </header>
      <div className="flex min-h-20 flex-col gap-2">
        {applications.map((application) => (
          <PipelineCard key={application.id} application={application} onMove={onMove} now={now} />
        ))}
        {applications.length === 0 && (
          <p className="rounded-control border border-dashed border-panel-border px-3 py-4 text-center font-mono text-xs text-text-eyebrow">Drop here</p>
        )}
      </div>
    </section>
  );
}
