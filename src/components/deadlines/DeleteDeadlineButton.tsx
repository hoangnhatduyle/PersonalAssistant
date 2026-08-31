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

/**
 * Plain confirm copy, unlike Task/Course: a Deadline delete response carries
 * no cascade block (only its own Reminder is silently dismissed by a DB
 * trigger, nothing cross-entity to disclose).
 */
export function DeleteDeadlineButton({ deadlineId }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const deleteDeadline = useDeleteDeadline(deadlineId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      await deleteDeadline.mutateAsync();
      showToast("Deadline deleted.", "success");
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
        description="This cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteDeadline.isPending}
      />
    </>
  );
}
