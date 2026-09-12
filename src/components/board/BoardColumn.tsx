"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BoardCard } from "@/components/board/BoardCard";
import type { TaskRow } from "@/lib/api/entity-types";

type Props = {
  id: string;
  name: string;
  courseName?: string;
  tasks: TaskRow[];
  peopleById: Map<string, string>;
  isUnsorted: boolean;
  onAddCard: () => void;
  onDeleteList?: () => void;
  isDeletingList?: boolean;
};

/** One Board List's column — a sortable+droppable region of BoardCards. "Unsorted" is a synthetic column (id "unsorted"), never a todo_lists row. */
export function BoardColumn({
  id,
  name,
  courseName,
  tasks,
  peopleById,
  isUnsorted,
  onAddCard,
  onDeleteList,
  isDeletingList,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", listId: isUnsorted ? null : id },
  });

  return (
    <GlassPanel
      className={`flex w-72 shrink-0 flex-col gap-3 p-3 transition-colors ${isOver ? "ring-2 ring-accent-indigo" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {courseName && (
            <p className="truncate font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">
              {courseName}
            </p>
          )}
          <h3 className="truncate font-display text-sm font-semibold text-text-primary">
            {name}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="neutral">{tasks.length}</Badge>
          {!isUnsorted && onDeleteList && (
            <button
              type="button"
              aria-label={`Delete list ${name}`}
              onClick={onDeleteList}
              disabled={isDeletingList}
              className="rounded p-1 text-text-secondary transition-colors hover:text-status-urgent disabled:opacity-50"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM9.5 1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25V3h3V1.75ZM4.997 6.178a.75.75 0 1 0-1.493.144l.44 4.56a2.25 2.25 0 0 0 2.24 2.018h3.632a2.25 2.25 0 0 0 2.24-2.018l.44-4.56a.75.75 0 0 0-1.494-.144l-.439 4.56a.75.75 0 0 1-.747.672H6.184a.75.75 0 0 1-.747-.672l-.44-4.56Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <SortableContext
        id={id}
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2">
          {tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              personName={
                task.person_id ? peopleById.get(task.person_id) : undefined
              }
            />
          ))}
        </div>
      </SortableContext>

      <Button type="button" variant="secondary" size="sm" onClick={onAddCard}>
        + Add card
      </Button>
    </GlassPanel>
  );
}
