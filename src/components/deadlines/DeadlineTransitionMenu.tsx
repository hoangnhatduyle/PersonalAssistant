"use client";

import { getValidDeadlineEvents, type DeadlineTransitionEvent } from "@/lib/api/transitions";
import type { DeadlineStatus } from "@/lib/api/entity-types";
import { useTransitionDeadline } from "@/hooks/useDeadlines";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

const EVENT_LABELS: Record<DeadlineTransitionEvent, string> = {
  user_marks_in_progress: "Mark In Progress",
  user_marks_submitted: "Mark Submitted",
  user_confirms_done: "Confirm Done",
  user_cancels: "Cancel",
};

type Props = {
  deadlineId: string;
  status: DeadlineStatus;
};

/** Overdue never offers Cancel — reads the same transition table the server enforces (src/lib/api/transitions.ts). */
export function DeadlineTransitionMenu({ deadlineId, status }: Props) {
  const events = getValidDeadlineEvents(status);
  const transition = useTransitionDeadline(deadlineId);
  const { showToast } = useToast();

  if (events.length === 0) return null;

  const handleTransition = async (event: DeadlineTransitionEvent) => {
    try {
      await transition.mutateAsync(event);
      showToast("Deadline updated", "success");
    } catch {
      showToast("Could not update deadline status", "error");
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
