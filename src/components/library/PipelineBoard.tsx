"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PipelineCard } from "@/components/library/PipelineCard";
import { PipelineColumn } from "@/components/library/PipelineColumn";
import { useApplicationTransition } from "@/hooks/useLibraryApplications";
import { useDragToPan } from "@/hooks/useDragToPan";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, type ApplicationStatus } from "@/lib/library/application-status";
import { pipelineKeyboardCoordinates, statusFromDroppableId } from "@/lib/library/pipeline-dnd";
import type { LibraryApplicationWithEmployer } from "@/lib/api/entity-types";

type Props = {
  applications: LibraryApplicationWithEmployer[];
};

// Pointer drags resolve by the cursor position; keyboard drags have none, so fall back to rect overlap.
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "To pick up an application, press space. Use the left and right arrow keys to move it between stages, then press space to drop it, or escape to cancel.",
};

const stageName = (id: unknown): string => {
  const status = statusFromDroppableId(id);
  return status ? APPLICATION_STATUS_LABEL[status] : "no stage";
};

/**
 * The drag-and-drop pipeline: one lane per status, cards are applications.
 * A cross-lane drop (or a card's status select) calls the transition hook,
 * which moves the card optimistically and rolls back with a toast on error.
 * There is no within-lane ordering — lanes sort by most recently moved.
 * Input: mouse/pen (6px drag), touch (200ms press), keyboard (see
 * pipelineKeyboardCoordinates), with screen-reader announcements.
 */
export function PipelineBoard({ applications }: Props) {
  const transition = useApplicationTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragPan = useDragToPan(scrollRef, [applications.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: pipelineKeyboardCoordinates }),
  );

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, [] as LibraryApplicationWithEmployer[]])) as Record<ApplicationStatus, LibraryApplicationWithEmployer[]>;
    for (const application of applications) groups[application.status].push(application);
    for (const status of APPLICATION_STATUSES) groups[status].sort((a, b) => b.status_changed_at.localeCompare(a.status_changed_at));
    return groups;
  }, [applications]);

  const byId = useMemo(() => new Map(applications.map((application) => [application.id, application])), [applications]);
  const describe = (id: unknown) => {
    const application = typeof id === "string" ? byId.get(id) : undefined;
    return application ? `${application.title} at ${application.employer.name}` : "Application";
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${describe(active.id)} is over the ${stageName(over.id)} stage.` : `${describe(active.id)} is not over a stage.`),
    onDragEnd: ({ active, over }) => (over ? `${describe(active.id)} was dropped in the ${stageName(over.id)} stage.` : `${describe(active.id)} was dropped.`),
    onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`,
  };

  const move = (id: string, to: ApplicationStatus) => {
    if (byId.get(id)?.status === to) return;
    transition.mutate({ id, to });
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const to = statusFromDroppableId(event.over?.id);
    if (to) move(String(event.active.id), to);
  };

  const activeApplication = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="relative">
        <div
          ref={scrollRef}
          onMouseDown={dragPan.onMouseDown}
          className={`scrollbar-hide flex snap-x items-start gap-3 overflow-x-auto pb-2 ${dragPan.isPanning ? "cursor-grabbing select-none" : ""}`}
        >
          {APPLICATION_STATUSES.map((status) => (
            <PipelineColumn key={status} status={status} applications={byStatus[status]} onMove={move} />
          ))}
        </div>
        {dragPan.canScrollLeft && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg-void to-transparent" />}
        {dragPan.canScrollRight && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg-void to-transparent" />}
      </div>

      <DragOverlay>{activeApplication ? <PipelineCard application={activeApplication} onMove={move} isOverlay /> : null}</DragOverlay>
    </DndContext>
  );
}
