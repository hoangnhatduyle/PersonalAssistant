"use client";

import { useState } from "react";
import { useAppointments, useCreateAppointment, useDeleteAppointment, useTransitionAppointment } from "@/hooks/useAppointments";
import { SessionForm, type SessionFormValues } from "@/components/deadlines/SessionForm";
import { buildSessionProgress } from "@/lib/deadlines/session-progress";
import { getValidSessionEvents, type SessionTransitionEvent } from "@/lib/api/transitions";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SESSION_STATUS_TONE } from "@/lib/status-colors";
import type { AppointmentRow } from "@/lib/api/entity-types";

type Props = {
  deadlineId: string;
};

const EVENT_LABELS: Record<SessionTransitionEvent, string> = {
  user_marks_session_done: "Mark Done",
  user_marks_session_skipped: "Mark Skipped",
};

function formatSessionDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Inline status-transition buttons for one session — structurally identical to DeadlineTransitionMenu. */
export function SessionTransitionButtons({ session }: { session: AppointmentRow }) {
  const events = session.session_status ? getValidSessionEvents(session.session_status) : [];
  const transition = useTransitionAppointment(session.id);
  const { showToast } = useToast();

  if (events.length === 0) return null;

  const handleTransition = async (event: SessionTransitionEvent) => {
    try {
      await transition.mutateAsync(event);
      showToast("Session updated", "success");
    } catch {
      showToast("Could not update session", "error");
    }
  };

  return (
    <div className="flex gap-2">
      {events.map((event) => (
        <Button
          key={event}
          size="sm"
          variant={event === "user_marks_session_skipped" ? "secondary" : "primary"}
          isLoading={transition.isPending}
          onClick={() => handleTransition(event)}
        >
          {EVENT_LABELS[event]}
        </Button>
      ))}
    </div>
  );
}

/**
 * Deadline detail's "Sessions" sub-section — same appointments rows shown in
 * Calendar (tagged category: "Session"), scoped to this deadline. Progress =
 * done / total over ALL non-deleted sessions ever created (see
 * buildSessionProgress) — skipped sessions stay in the denominator.
 */
export function SessionsSection({ deadlineId }: Props) {
  const { data, isLoading } = useAppointments({ deadlineId });
  const sessions = data?.rows ?? [];
  const progress = buildSessionProgress(sessions)[0];

  const createSession = useCreateAppointment();
  const { showToast } = useToast();

  const [isFormOpen, setFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingSession = sessions.find((session) => session.id === deletingId);
  const deleteSession = useDeleteAppointment(deletingId ?? "");

  const handleCreate = (values: SessionFormValues) => {
    createSession.mutate(
      { ...values, deadline_id: deadlineId },
      {
        onSuccess: () => setFormOpen(false),
        onError: () => showToast("Could not add session", "error"),
      },
    );
  };

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Sessions</p>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          + Add Session
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions planned" description='Click "+ Add Session" to plan work toward this deadline.' />
      ) : (
        <>
          {progress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-text-secondary">Session progress</span>
                <span className="font-mono text-xs text-text-secondary">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <ProgressBar value={progress.ratio} label="Session progress" />
            </div>
          )}

          <ul className="flex flex-col divide-y divide-panel-border">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-text-primary">{session.title}</p>
                    {session.session_status && <Badge tone={SESSION_STATUS_TONE[session.session_status]}>{session.session_status}</Badge>}
                  </div>
                  <span className="font-mono text-xs text-text-secondary">
                    {formatSessionDate(session.date)}
                    {session.time ? ` · ${session.time}` : ""}
                    {session.duration_minutes ? ` · ${session.duration_minutes}m` : ""}
                  </span>
                  <SessionTransitionButtons session={session} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDeletingId(session.id)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={isFormOpen} onClose={() => setFormOpen(false)} title="Add Session">
        <SessionForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) {
            deleteSession.mutate(undefined, { onSuccess: () => setDeletingId(null) });
          }
        }}
        title="Delete this session?"
        description={deletingSession ? `"${deletingSession.title}" will be permanently removed.` : ""}
        confirmLabel="Delete"
      />
    </GlassPanel>
  );
}
