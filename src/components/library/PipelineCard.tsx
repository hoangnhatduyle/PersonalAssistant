"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { ApplicationStatusControl } from "@/components/library/ApplicationStatusControl";
import { daysInStage, isActiveStatus, type ApplicationStatus } from "@/lib/library/application-status";
import { WORK_MODE_LABEL } from "@/lib/library/labels";
import type { LibraryApplicationWithEmployer } from "@/lib/api/entity-types";

type Props = {
  application: LibraryApplicationWithEmployer;
  /** Fallback (non-drag) move: the card's own status select. */
  onMove: (id: string, to: ApplicationStatus) => void;
  now?: Date;
  /** Rendered inside the DragOverlay: no drag wiring, no controls. */
  isOverlay?: boolean;
};

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <circle cx="5.5" cy="3.5" r="1.25" />
      <circle cx="10.5" cy="3.5" r="1.25" />
      <circle cx="5.5" cy="8" r="1.25" />
      <circle cx="10.5" cy="8" r="1.25" />
      <circle cx="5.5" cy="12.5" r="1.25" />
      <circle cx="10.5" cy="12.5" r="1.25" />
    </svg>
  );
}

function CardBody({ application, now }: { application: LibraryApplicationWithEmployer; now?: Date }) {
  const days = daysInStage(application.status_changed_at, now);
  const meta = [application.work_mode ? WORK_MODE_LABEL[application.work_mode] : null, application.location].filter(Boolean).join(" · ");
  return (
    <>
      <div className="min-w-0">
        <p className="truncate font-display text-base font-semibold leading-tight text-text-primary">{application.employer.name}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{application.title}</p>
      </div>
      <p className="font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
        {days === 0 ? "Today" : `${days}d in stage`}
        {meta ? ` · ${meta}` : ""}
      </p>
    </>
  );
}

/**
 * One application on the pipeline board. The card is draggable by pointer or
 * long-press (whole card) and by keyboard (the grip button: Space, then
 * ← / →, Space); its status select is the always-available non-drag move.
 */
export function PipelineCard({ application, onMove, now, isOverlay = false }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: application.id,
    data: { type: "application", status: application.status },
    disabled: isOverlay,
  });

  const label = `${application.title} at ${application.employer.name}`;

  if (isOverlay) {
    return (
      <div data-dossier-status={application.status} className="pipeline-card flex cursor-grabbing flex-col gap-2 rounded-panel border p-3 shadow-panel">
        <CardBody application={application} now={now} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-dossier-status={application.status}
      data-dragging={isDragging || undefined}
      data-muted={!isActiveStatus(application.status)}
      {...listeners}
      className="pipeline-card flex flex-col gap-2 rounded-panel border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/library/employers/${application.employer.id}`}
          className="min-w-0 flex-1 rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-indigo"
        >
          <CardBody application={application} now={now} />
        </Link>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          aria-label={`Move ${label}`}
          className="-mr-1 -mt-1 shrink-0 cursor-grab rounded-control p-1.5 text-text-secondary outline-offset-2 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent-indigo active:cursor-grabbing"
        >
          <GripIcon />
        </button>
      </div>
      <ApplicationStatusControl value={application.status} onChange={(to) => onMove(application.id, to)} label={`Status for ${label}`} />
    </div>
  );
}
