"use client";

import { getValidTaskEvents, type TaskTransitionEvent } from "@/lib/api/transitions";
import type { TaskStatus } from "@/lib/api/entity-types";
import { useTransitionTask } from "@/hooks/useTasks";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

const EVENT_LABELS: Record<TaskTransitionEvent, string> = {
  user_marks_done: "Mark Done",
  user_cancels: "Cancel",
};

type Props = {
  taskId: string;
  status: TaskStatus;
};

/** Reads the same transition table the server enforces (src/lib/api/transitions.ts) — no reopen affordance exists for either terminal state. */
export function TaskTransitionMenu({ taskId, status }: Props) {
  const events = getValidTaskEvents(status);
  const transition = useTransitionTask(taskId);
  const { showToast } = useToast();

  if (events.length === 0) return null;

  const handleTransition = async (event: TaskTransitionEvent) => {
    try {
      await transition.mutateAsync(event);
      showToast(event === "user_marks_done" ? "Task marked done" : "Task cancelled", "success");
    } catch {
      showToast("Could not update task status", "error");
    }
  };

  return (
    <div className="flex gap-2">
      {events.map((event) => (
        <Button
          key={event}
          size="sm"
          variant={event === "user_cancels" ? "secondary" : "primary"}
          isLoading={transition.isPending}
          onClick={() => handleTransition(event)}
        >
          {EVENT_LABELS[event]}
        </Button>
      ))}
    </div>
  );
}
