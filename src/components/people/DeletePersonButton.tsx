"use client";

import { useState } from "react";
import { useDeletePerson } from "@/hooks/usePeople";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  personId: string;
  personName: string;
};

/**
 * Deleting a Person cascades to soft-delete their live courses/deadlines/
 * tasks and dismiss their reminders (see soft_delete_person_cascade in
 * supabase/migrations/0013_people.sql) — the DELETE response's exact counts
 * render in the post-delete toast, mirroring DeleteCourseButton.
 */
export function DeletePersonButton({ personId, personName }: Props) {
  const [open, setOpen] = useState(false);
  const deletePerson = useDeletePerson(personId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      const result = await deletePerson.mutateAsync();
      showToast(
        `${personName} removed — ${result.cascade.coursesDeleted} course(s), ${result.cascade.deadlinesDeleted} deadline(s), ` +
          `${result.cascade.tasksDeleted} task(s) deleted, ${result.cascade.remindersDismissed} reminder(s) dismissed.`,
        "success",
      );
      setOpen(false);
    } catch {
      showToast("Could not remove person", "error");
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title={`Remove ${personName}?`}
        description="This also deletes their courses, deadlines, and tasks, and dismisses any of their pending reminders."
        confirmLabel="Remove"
        isConfirming={deletePerson.isPending}
      />
    </>
  );
}
