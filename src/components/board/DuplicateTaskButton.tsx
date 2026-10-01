"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDuplicateTask, useUpdateTask } from "@/hooks/useTasks";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

type Props = {
  taskId: string;
  /** Rendered inside BoardCardDetailDialog: switches the dialog to the new copy. Without it (standalone card page) the button navigates to /board/[id] instead. */
  onOpenTask?: (taskId: string) => void;
};

type PromptProps = {
  newTaskId: string;
  onDone: () => void;
};

/** Mounted per new card so useUpdateTask is bound to the copy's id, which only exists after the duplicate call returns. */
function NewCardDueDatePrompt({ newTaskId, onDone }: PromptProps) {
  const [dueAt, setDueAt] = useState<string | null>(null);
  const updateTask = useUpdateTask(newTaskId);
  const { showToast } = useToast();

  const handleSave = async () => {
    if (dueAt) {
      try {
        await updateTask.mutateAsync({ due_at: dueAt });
      } catch {
        showToast("Could not set the due date", "error");
        return;
      }
    }
    onDone();
  };

  return (
    <Dialog open onClose={onDone} title="Due date for the new card">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          The copy starts without a due date. Pick one now, or skip and set it later.
        </p>
        <label htmlFor="duplicate-due-at" className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
          Due date
        </label>
        <DateTimeField id="duplicate-due-at" value={dueAt} onChange={setDueAt} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onDone}>
            Skip
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={updateTask.isPending} disabled={!dueAt}>
            Save due date
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * A Done card is terminal (guard_task_status) — "Duplicate as new" copies it
 * into a fresh Open card instead, then asks for the copy's due date.
 */
export function DuplicateTaskButton({ taskId, onOpenTask }: Props) {
  const duplicateTask = useDuplicateTask(taskId);
  const router = useRouter();
  const { showToast } = useToast();
  const [newTaskId, setNewTaskId] = useState<string | null>(null);

  const handleDuplicate = async () => {
    try {
      const copy = await duplicateTask.mutateAsync();
      setNewTaskId(copy.id);
    } catch {
      showToast("Could not duplicate card", "error");
    }
  };

  const handlePromptDone = () => {
    const openedId = newTaskId;
    setNewTaskId(null);
    if (!openedId) return;
    showToast("New card created", "success");
    if (onOpenTask) onOpenTask(openedId);
    else router.push(`/board/${openedId}`);
  };

  return (
    <>
      <Button variant="secondary" size="sm" isLoading={duplicateTask.isPending} onClick={handleDuplicate}>
        Duplicate as new
      </Button>
      {newTaskId && <NewCardDueDatePrompt newTaskId={newTaskId} onDone={handlePromptDone} />}
    </>
  );
}
