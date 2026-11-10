"use client";

import { useDeadline } from "@/hooks/useDeadlines";
import { DeadlineDetailContainer } from "@/components/deadlines/DeadlineDetailContainer";
import { Dialog } from "@/components/ui/Dialog";

type Props = {
  deadlineId: string | null;
  onClose: () => void;
};

/** In-place deadline detail (status, progress, edit, sessions, notes) for places that are not the deadline's own page, such as the Up Next Gantt. Shares useDeadline's cache entry with the container, so an already-loaded deadline triggers no extra fetch. */
export function DeadlineDetailDialog({ deadlineId, onClose }: Props) {
  const { data: deadline } = useDeadline(deadlineId ?? "");

  return (
    <Dialog open={deadlineId !== null} onClose={onClose} title={deadline?.title ?? "Deadline"} size="lg">
      {deadlineId && <DeadlineDetailContainer deadlineId={deadlineId} embedded onDeleted={onClose} />}
    </Dialog>
  );
}
