"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteTask } from "@/hooks/useTasks";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  taskId: string;
};

/** Task delete does disclose `notesUnlinked` (it also cascades — clears linked_task_id on its Notes). */
export function DeleteTaskButton({ taskId }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const deleteTask = useDeleteTask(taskId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      const result = await deleteTask.mutateAsync();
      showToast(
        result.cascade.notesUnlinked > 0
          ? `Task deleted — ${result.cascade.notesUnlinked} note(s) unlinked.`
          : "Task deleted.",
        "success",
      );
      setOpen(false);
      router.push("/tasks");
    } catch {
      showToast("Could not delete task", "error");
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete task
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Delete this task?"
        description="Any notes linked to it will be unlinked."
        confirmLabel="Delete"
        isConfirming={deleteTask.isPending}
      />
    </>
  );
}
