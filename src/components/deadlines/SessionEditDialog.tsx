"use client";

import Link from "next/link";
import { useAppointment, useUpdateAppointment } from "@/hooks/useAppointments";
import { SessionForm, type SessionFormValues } from "@/components/deadlines/SessionForm";
import { SessionTransitionButtons } from "@/components/deadlines/SessionsSection";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type Props = {
  sessionId: string | null;
  onClose: () => void;
};

/** Edit one Deadline Session in place: its details and progress, plus done / skipped / reopen. Mirrors SessionsSection's own edit dialog for use outside the deadline page. */
export function SessionEditDialog({ sessionId, onClose }: Props) {
  const { data: session, isLoading } = useAppointment(sessionId ?? "");
  const updateSession = useUpdateAppointment(sessionId ?? "");
  const { showToast } = useToast();

  const handleUpdate = (values: SessionFormValues) => {
    updateSession.mutate(values, {
      onSuccess: () => {
        showToast("Session updated", "success");
        onClose();
      },
      onError: () => showToast("Could not update session", "error"),
    });
  };

  return (
    <Dialog open={sessionId !== null} onClose={onClose} title={session?.title ?? "Session"}>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && !session && <p className="text-sm text-text-secondary">Session not found.</p>}
      {session && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SessionTransitionButtons session={session} />
            {session.deadline_id && (
              <Link href={`/courses/deadlines/${session.deadline_id}`} className="text-xs text-text-secondary underline hover:text-text-primary">
                Open its deadline
              </Link>
            )}
          </div>
          <SessionForm session={session} onSubmit={handleUpdate} onCancel={onClose} />
        </div>
      )}
    </Dialog>
  );
}
