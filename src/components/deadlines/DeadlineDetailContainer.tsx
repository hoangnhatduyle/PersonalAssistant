"use client";

import { useState } from "react";
import { useDeadline, useUpdateDeadline } from "@/hooks/useDeadlines";
import { useCourse } from "@/hooks/useCourses";
import { DeadlineForm } from "@/components/deadlines/DeadlineForm";
import { DeadlineTransitionMenu } from "@/components/deadlines/DeadlineTransitionMenu";
import { DeleteDeadlineButton } from "@/components/deadlines/DeleteDeadlineButton";
import { FeedbackControl } from "@/components/feedback/FeedbackControl";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DEADLINE_STATUS_TONE } from "@/lib/status-colors";
import type { DeadlinePayload } from "@/lib/api/schemas";

type Props = {
  deadlineId: string;
};

export function DeadlineDetailContainer({ deadlineId }: Props) {
  const { data: deadline, isLoading } = useDeadline(deadlineId);
  const { data: course } = useCourse(deadline?.course_id ?? "");
  const updateDeadline = useUpdateDeadline(deadlineId);
  const { showToast } = useToast();
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

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">{course?.name ?? "Deadline"}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">{deadline.title}</h1>
            <p className="mt-1 font-mono text-xs text-text-secondary">Due {new Date(deadline.due_at).toLocaleString()}</p>
          </div>
          <StatusPill status={deadline.status} tone={DEADLINE_STATUS_TONE[deadline.status]} />
        </div>

        <div className="flex flex-wrap gap-2">
          <DeadlineTransitionMenu deadlineId={deadline.id} status={deadline.status} />
          <Button variant="secondary" size="sm" onClick={() => setIsEditing((value) => !value)}>
            {isEditing ? "Cancel edit" : "Edit"}
          </Button>
          <DeleteDeadlineButton deadlineId={deadline.id} />
        </div>

        {isEditing && (
          <DeadlineForm deadline={deadline} onSubmit={handleUpdate} onCancel={() => setIsEditing(false)} submitLabel="Save changes" />
        )}

        {deadline.status === "Completed" && <FeedbackControl targetType="deadline" targetId={deadline.id} />}
      </GlassPanel>
    </div>
  );
}
