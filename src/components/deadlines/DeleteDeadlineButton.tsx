"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteDeadline } from "@/hooks/useDeadlines";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  deadlineId: string;
  /** A recurring deadline is one row per occurrence (see deadline-recurrence-gate.ts) — deleting this id only ever removes this one occurrence, never the series. The dialog copy says so explicitly so it doesn't read as ambiguous with the Cancel action's occurrence/series choice. */
  isRecurring?: boolean;
};

/** Discloses `sessionsAffected` from the cascade result, mirroring how DeleteTaskButton discloses `notesUnlinked`. */
export function DeleteDeadlineButton({ deadlineId, isRecurring = false }: Props) {
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
      router.push("/courses/deadlines");
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
        description={
          isRecurring
            ? "This deletes only this occurrence — the rest of the series is not affected. Any sessions planned for this occurrence will be removed too. This cannot be undone."
            : "This cannot be undone. Any sessions planned for it will be removed too."
        }
        confirmLabel="Delete"
        isConfirming={deleteDeadline.isPending}
      />
    </>
  );
}
