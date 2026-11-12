"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useChecklistItems,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useReorderChecklistItems,
  useUpdateChecklistItem,
} from "@/hooks/useChecklistItems";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { ChecklistItemRow } from "@/lib/api/entity-types";

type RowProps = {
  item: ChecklistItemRow;
  taskId: string;
};

function ChecklistRow({ item, taskId }: RowProps) {
  const updateItem = useUpdateChecklistItem(item.id, taskId);
  const deleteItem = useDeleteChecklistItem(item.id, taskId);
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const handleToggle = async () => {
    try {
      await updateItem.mutateAsync({ is_done: !item.is_done });
    } catch {
      showToast("Could not update checklist item", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteItem.mutateAsync();
    } catch {
      showToast("Could not delete checklist item", "error");
    }
  };

  const startEditing = () => {
    setDraft(item.label);
    setIsEditing(true);
  };

  const commitEdit = async () => {
    const label = draft.trim();
    setIsEditing(false);
    if (!label || label === item.label) return;
    try {
      await updateItem.mutateAsync({ label });
    } catch {
      showToast("Could not rename checklist item", "error");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-2 ${isDragging ? "relative z-10 opacity-60" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder ${item.label}`}
        className="cursor-grab touch-none px-1 text-text-secondary hover:text-text-primary active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <input
        type="checkbox"
        aria-label={`Mark ${item.label} done`}
        checked={item.is_done}
        onChange={handleToggle}
        disabled={updateItem.isPending}
        className="h-4 w-4 rounded border-panel-border bg-bg-void-elevated text-accent-indigo focus:ring-2 focus:ring-accent-indigo/50"
      />
      {isEditing ? (
        <Input
          autoFocus
          aria-label={`Edit ${item.label}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(item.label);
              setIsEditing(false);
            }
          }}
          className="flex-1 py-1"
        />
      ) : (
        <button
          type="button"
          title="Click to edit"
          onClick={startEditing}
          className={`flex-1 rounded-control px-1 text-left text-sm hover:bg-bg-void-elevated ${
            item.is_done ? "text-text-secondary line-through" : "text-text-primary"
          }`}
        >
          {item.label}
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${item.label}`}
        onClick={handleDelete}
        isLoading={deleteItem.isPending}
      >
        ×
      </Button>
    </div>
  );
}

type Props = {
  taskId: string;
};

/** Trello-style checklist on a card, slotted into BoardCardDetailContainer between the action row and Notes. Items can be renamed inline (click the text) and reordered by dragging the handle. */
export function ChecklistSection({ taskId }: Props) {
  const { data: items, isLoading } = useChecklistItems(taskId);
  const createItem = useCreateChecklistItem(taskId);
  const { showToast } = useToast();
  const reorderItems = useReorderChecklistItems(taskId);
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!items || !over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    try {
      await reorderItems.mutateAsync(arrayMove(items, from, to));
    } catch {
      showToast("Could not reorder checklist", "error");
    }
  };

  const handleAdd = async () => {
    const label = draft.trim();
    if (!label) return;
    try {
      const nextPosition = items?.length ?? 0;
      await createItem.mutateAsync({ task_id: taskId, label, position: nextPosition });
      setDraft("");
    } catch {
      showToast("Could not add checklist item", "error");
    }
  };

  const doneCount = items?.filter((item) => item.is_done).length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Checklist</p>
        {items && items.length > 0 && (
          <p className="text-xs text-text-secondary">
            {doneCount}/{items.length} done
          </p>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleAdd();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an item..."
          className="flex-1"
        />
        <Button type="submit" variant="secondary" size="sm" isLoading={createItem.isPending}>
          Add
        </Button>
      </form>

      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : items && items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <ChecklistRow key={item.id} item={item} taskId={taskId} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-text-secondary">No checklist items yet.</p>
      )}
    </div>
  );
}
