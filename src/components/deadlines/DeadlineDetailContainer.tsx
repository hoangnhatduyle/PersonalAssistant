"use client";

import { useState } from "react";
import { useDeadline, useUpdateDeadline } from "@/hooks/useDeadlines";
import { useCourse } from "@/hooks/useCourses";
import { useAppointments } from "@/hooks/useAppointments";
import { DeadlineForm } from "@/components/deadlines/DeadlineForm";
import { DeadlineTransitionMenu } from "@/components/deadlines/DeadlineTransitionMenu";
import { DeleteDeadlineButton } from "@/components/deadlines/DeleteDeadlineButton";
import { SessionsSection } from "@/components/deadlines/SessionsSection";
import { NotesForTarget } from "@/components/notes/NotesForTarget";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ProgressSummary } from "@/components/ui/ProgressSummary";
import { useToast } from "@/components/ui/Toast";
import { DEADLINE_STATUS_TONE } from "@/lib/status-colors";
import { formatDeadlineRecurrence } from "@/lib/deadlines/recurrence";
import { formatDateTime } from "@/lib/format/zoned-datetime";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import type { DeadlinePayload } from "@/lib/api/schemas";
import { resolveDeadlineProgress, toAutoProgress } from "@/lib/progress/resolve-progress";

type Props = {
  deadlineId: string;
  /** Rendered inside DeadlineDetailDialog, which already shows the title in its own header -- drop the outer panel and h1. */
  embedded?: boolean;
  /** Forwarded to DeleteDeadlineButton -- closes the dialog on delete instead of navigating to the deadlines list. */
  onDeleted?: () => void;
};

export function DeadlineDetailContainer({ deadlineId, embedded = false, onDeleted }: Props) {
  const { data: deadline, isLoading } = useDeadline(deadlineId);
  const { data: course } = useCourse(deadline?.course_id ?? "");
  // Same query SessionsSection runs, so this shares its cache entry rather than fetching twice.
  const { data: sessionList } = useAppointments({ deadlineId });
  const updateDeadline = useUpdateDeadline(deadlineId);
  const { showToast } = useToast();
  const timeZone = useUserTimezone();
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!deadline) return <p className="text-sm text-text-secondary">Deadline not found.</p>;

  const handleUpdate = async (values: DeadlinePayload) => {
    try {
      await updateDeadline.mutateAsync(values);
      showToast("Deadline updated", "success");
      setIsEditing(false);
    } catch {
      showToast("Could not update deadline", "error");
    }
  };

  const recurrenceLabel = formatDeadlineRecurrence(deadline.recurrence_days, deadline.recurrence_end_date);
  const sessions = sessionList?.rows ?? [];
  const progress = resolveDeadlineProgress(deadline, sessions);
  // What the slider would show if the hand-set value were cleared.
  const autoProgress = toAutoProgress(resolveDeadlineProgress({ ...deadline, progress_percent: null }, sessions));

  const header = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">{course?.name ?? "Deadline"}</p>
          {!embedded && <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">{deadline.title}</h1>}
          <p className="mt-1 font-mono text-xs text-text-secondary">Due {formatDateTime(deadline.due_at, timeZone)}</p>
          {recurrenceLabel && <p className="mt-1 font-mono text-xs text-accent-indigo">{recurrenceLabel}</p>}
        </div>
        <StatusPill status={deadline.status} tone={DEADLINE_STATUS_TONE[deadline.status]} />
      </div>

      <ProgressSummary progress={progress} estimatedHours={deadline.estimated_hours} />

      <div className="flex flex-wrap gap-2">
        <DeadlineTransitionMenu deadlineId={deadline.id} status={deadline.status} isRecurring={deadline.recurrence_days.length > 0} />
        <Button variant="secondary" size="sm" onClick={() => setIsEditing((value) => !value)}>
          {isEditing ? "Cancel edit" : "Edit"}
        </Button>
        <DeleteDeadlineButton deadlineId={deadline.id} isRecurring={deadline.recurrence_days.length > 0} onDeleted={onDeleted} />
      </div>

      {isEditing && (
        <DeadlineForm deadline={deadline} autoProgress={autoProgress} onSubmit={handleUpdate} onCancel={() => setIsEditing(false)} submitLabel="Save changes" />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {embedded ? <div className="flex flex-col gap-4">{header}</div> : <GlassPanel className="flex flex-col gap-4 p-6">{header}</GlassPanel>}

      <GlassPanel className="p-6">
        <NotesForTarget targetType="deadline" targetId={deadline.id} />
      </GlassPanel>

      <SessionsSection deadlineId={deadline.id} />
    </div>
  );
}
