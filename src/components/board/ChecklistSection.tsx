"use client";

import { useState } from "react";
import {
  useChecklistItems,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useUpdateChecklistItem,
} from "@/hooks/useChecklistItems";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
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

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        label={item.label}
        checked={item.is_done}
        onChange={handleToggle}
        disabled={updateItem.isPending}
        className={`flex-1 ${item.is_done ? "text-text-secondary line-through" : ""}`}
      />
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

/** Trello-style checklist on a card, slotted into BoardCardDetailContainer between the action row and Notes. Append-only position (no drag-reorder in v1). */
export function ChecklistSection({ taskId }: Props) {
  const { data: items, isLoading } = useChecklistItems(taskId);
  const createItem = useCreateChecklistItem(taskId);
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");

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
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <ChecklistRow key={item.id} item={item} taskId={taskId} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No checklist items yet.</p>
      )}
    </div>
  );
}
