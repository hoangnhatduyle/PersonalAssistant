"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteTask } from "@/hooks/useTasks";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  taskId: string;
  /** Rendered inside BoardCardDetailDialog (embedded): closes the dialog instead of the standalone page's router.push("/board"), which would otherwise no-op (we're already on /board) and leave the dialog open showing "Card not found." */
  onDeleted?: () => void;
};

/** Card delete does disclose `notesUnlinked` (it also cascades — clears linked_task_id on its Notes). */
export function DeleteTaskButton({ taskId, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const deleteTask = useDeleteTask(taskId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      const result = await deleteTask.mutateAsync();
      showToast(
        result.cascade.notesUnlinked > 0
          ? `Card deleted — ${result.cascade.notesUnlinked} note(s) unlinked.`
          : "Card deleted.",
        "success",
      );
      setOpen(false);
      if (onDeleted) onDeleted();
      else router.push("/board");
    } catch {
      showToast("Could not delete card", "error");
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete card
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Delete this card?"
        description="Any notes linked to it will be unlinked."
        confirmLabel="Delete"
        isConfirming={deleteTask.isPending}
      />
    </>
  );
}
