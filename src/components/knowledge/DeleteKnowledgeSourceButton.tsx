"use client";

import { useState } from "react";
import { useDeleteKnowledgeSource } from "@/hooks/useKnowledge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  sourceId: string;
};

/** Hard delete (unlike every other entity) — no cascade disclosure needed, chunk removal is automatic via FK cascade. */
export function DeleteKnowledgeSourceButton({ sourceId }: Props) {
  const [open, setOpen] = useState(false);
  const deleteSource = useDeleteKnowledgeSource(sourceId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      await deleteSource.mutateAsync();
      showToast("Source deleted", "success");
      setOpen(false);
    } catch {
      showToast("Could not delete the source", "error");
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Delete this source?"
        description="This permanently deletes the source and its indexed content — this cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteSource.isPending}
      />
    </>
  );
}
