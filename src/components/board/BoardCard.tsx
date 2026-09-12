"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { LabelChip } from "@/components/ui/LabelChip";
import { ITEM_PRIORITY_TONE } from "@/lib/status-colors";
import type { TaskWithLabels } from "@/lib/api/entity-types";

type Props = {
  task: TaskWithLabels;
  /** Resolved from the board's own people list — avoids each card fetching People itself. */
  personName?: string;
  onOpenCard: (taskId: string) => void;
};

function formatDueDate(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** One draggable card in a Board column — compact by design (title, due date, priority, person, labels); open it for the full detail/transition/notes view. */
export function BoardCard({ task, personName, onOpenCard }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "card", listId: task.list_id },
  });

  const isResolved = task.status !== "Open";
  const isOverdue =
    task.status === "Open" &&
    Boolean(task.due_at) &&
    new Date(task.due_at!).getTime() < Date.now();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
      {...attributes}
      {...listeners}
    >
      <GlassPanel
        className={`flex cursor-grab flex-col gap-2 p-3 active:cursor-grabbing ${isResolved ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenCard(task.id);
          }}
          className={`text-left font-display text-sm font-medium text-text-primary hover:underline ${task.status === "Done" ? "line-through" : ""}`}
        >
          {task.title}
        </button>

        {(task.due_at ||
          task.priority ||
          task.task_labels.length > 0 ||
          personName) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {task.due_at && (
              <span
                className={`font-mono text-[11px] ${isOverdue ? "text-status-urgent" : "text-text-secondary"}`}
              >
                {formatDueDate(task.due_at)}
              </span>
            )}
            {task.priority && (
              <Badge tone={ITEM_PRIORITY_TONE[task.priority]}>
                {task.priority}
              </Badge>
            )}
            {personName && <Badge tone="accent">For {personName}</Badge>}
            {task.task_labels.map(({ label }) => (
              <LabelChip key={label.id} color={label.color}>
                {label.name}
              </LabelChip>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
