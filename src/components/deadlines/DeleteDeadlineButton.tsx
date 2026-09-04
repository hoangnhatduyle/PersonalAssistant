"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteDeadline } from "@/hooks/useDeadlines";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  deadlineId: string;
};

/** Discloses `sessionsAffected` from the cascade result, mirroring how DeleteTaskButton discloses `notesUnlinked`. */
export function DeleteDeadlineButton({ deadlineId }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const deleteDeadline = useDeleteDeadline(deadlineId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      const result = await deleteDeadline.mutateAsync();
      showToast(
        result.cascade.sessionsAffected > 0
          ? `Deadline deleted — ${result.cascade.sessionsAffected} session(s) removed.`
          : "Deadline deleted.",
        "success",
      );
      setOpen(false);
      router.push("/deadlines");
    } catch {
      showToast("Could not delete deadline", "error");
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete deadline
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Delete this deadline?"
        description="This cannot be undone. Any planned sessions will be removed too."
        confirmLabel="Delete"
        isConfirming={deleteDeadline.isPending}
      />
    </>
  );
}
