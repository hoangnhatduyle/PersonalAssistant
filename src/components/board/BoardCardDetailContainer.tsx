"use client";

import { useState } from "react";
import { useTask, useUpdateTask } from "@/hooks/useTasks";
import { useTodoLists } from "@/hooks/useTodoLists";
import { TaskForm } from "@/components/board/TaskForm";
import { TaskTransitionMenu } from "@/components/board/TaskTransitionMenu";
import { DeleteTaskButton } from "@/components/board/DeleteTaskButton";
import { NotesForTarget } from "@/components/notes/NotesForTarget";
import { FeedbackControl } from "@/components/feedback/FeedbackControl";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { TASK_STATUS_TONE } from "@/lib/status-colors";
import type { TaskPayload } from "@/lib/api/schemas";

type Props = {
  taskId: string;
};

export function BoardCardDetailContainer({ taskId }: Props) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: todoLists } = useTodoLists({ limit: 100 });
  const updateTask = useUpdateTask(taskId);
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!task)
    return <p className="text-sm text-text-secondary">Card not found.</p>;

  const listName = task.list_id
    ? todoLists?.rows.find((list) => list.id === task.list_id)?.name
    : undefined;

  const handleUpdate = async (values: TaskPayload) => {
    try {
      await updateTask.mutateAsync(values);
      showToast("Card updated", "success");
      setIsEditing(false);
    } catch {
      showToast("Could not update card", "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
              {listName ?? "Unsorted"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
              {task.title}
            </h1>
          </div>
          <StatusPill
            status={task.status}
            tone={TASK_STATUS_TONE[task.status]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <TaskTransitionMenu taskId={task.id} status={task.status} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? "Cancel edit" : "Edit"}
          </Button>
          <DeleteTaskButton taskId={task.id} />
        </div>

        {isEditing && (
          <TaskForm
            task={task}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save changes"
          />
        )}

        {task.status === "Done" && (
          <FeedbackControl targetType="task" targetId={task.id} />
        )}
      </GlassPanel>

      <NotesForTarget targetType="task" targetId={task.id} />
    </div>
  );
}
