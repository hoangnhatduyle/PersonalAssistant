"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteCourse } from "@/hooks/useCourses";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  courseId: string;
};

/**
 * No pre-delete preview route exists for the REST path, so the warning is
 * generic; the DELETE response's actual cascade counts render in the
 * post-delete toast instead. Deleting a course also soft-deletes its live
 * deadlines and dismisses their reminders (verified against
 * soft_delete_course_cascade in supabase/migrations/0002_delete_cascade.sql
 * — it sets deadlines.deleted_at, not just their reminders) and unlinks any
 * notes linked to the course.
 */
export function DeleteCourseButton({ courseId }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const deleteCourse = useDeleteCourse(courseId);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    try {
      const result = await deleteCourse.mutateAsync();
      showToast(
        `Course deleted — ${result.cascade.deadlinesDeleted} deadline(s) deleted, ` +
          `${result.cascade.remindersDismissed} reminder(s) dismissed, ${result.cascade.notesUnlinked} note(s) unlinked.`,
        "success",
      );
      setOpen(false);
      router.push("/courses");
    } catch {
      showToast("Could not delete course", "error");
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete course
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Delete this course?"
        description="Deleting this course also deletes its deadlines, dismisses their reminders, and unlinks its notes."
        confirmLabel="Delete"
        isConfirming={deleteCourse.isPending}
      />
    </>
  );
}
