"use client";

import { useState } from "react";
import { getValidDeadlineEvents, type DeadlineCancelScope, type DeadlineTransitionEvent } from "@/lib/api/transitions";
import type { DeadlineStatus } from "@/lib/api/entity-types";
import { useTransitionDeadline } from "@/hooks/useDeadlines";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

const EVENT_LABELS: Record<DeadlineTransitionEvent, string> = {
  user_marks_in_progress: "Mark In Progress",
  user_marks_submitted: "Mark Submitted",
  user_confirms_done: "Confirm Done",
  user_cancels: "Cancel",
};

type Props = {
  deadlineId: string;
  status: DeadlineStatus;
  /** A repeating deadline: Cancel first asks whether it means this occurrence or the whole series. */
  isRecurring?: boolean;
  /** "lg" is Driving Mode's oversized touch target — everywhere else stays "sm". */
  size?: "sm" | "lg";
};

/** Overdue never offers Cancel — reads the same transition table the server enforces (src/lib/api/transitions.ts). */
export function DeadlineTransitionMenu({ deadlineId, status, isRecurring = false, size = "sm" }: Props) {
  const events = getValidDeadlineEvents(status);
  const transition = useTransitionDeadline(deadlineId);
  const { showToast } = useToast();
  const [isChoosingCancelScope, setIsChoosingCancelScope] = useState(false);

  if (events.length === 0) return null;

  const handleTransition = async (event: DeadlineTransitionEvent, scope?: DeadlineCancelScope) => {
    try {
      await transition.mutateAsync(scope ? { event, scope } : { event });
      showToast(scope === "series" ? "Series cancelled" : "Deadline updated", "success");
    } catch {
      showToast("Could not update deadline status", "error");
    } finally {
      setIsChoosingCancelScope(false);
    }
  };

  const handleClick = (event: DeadlineTransitionEvent) => {
    if (event === "user_cancels" && isRecurring) setIsChoosingCancelScope(true);
    else void handleTransition(event);
  };

  return (
    <div className={`flex gap-2 ${size === "lg" ? "flex-wrap" : ""}`}>
      {events.map((event) => (
        <Button
          key={event}
          size={size === "lg" ? "md" : "sm"}
          variant={event === "user_cancels" ? "secondary" : "primary"}
          isLoading={transition.isPending}
          onClick={() => handleClick(event)}
          className={size === "lg" ? "px-6 py-3 text-base" : ""}
        >
          {EVENT_LABELS[event]}
        </Button>
      ))}

      <Dialog open={isChoosingCancelScope} onClose={() => setIsChoosingCancelScope(false)} title="Cancel a repeating deadline">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">This deadline repeats. What should be cancelled?</p>
          <div className="flex flex-col gap-3">
            <Button variant="secondary" isLoading={transition.isPending} onClick={() => handleTransition("user_cancels", "occurrence")}>
              Cancel this occurrence
            </Button>
            <p className="-mt-1 text-xs text-text-secondary">Only this one. The series carries on with the next occurrence.</p>
            <Button variant="destructive" isLoading={transition.isPending} onClick={() => handleTransition("user_cancels", "series")}>
              Cancel the whole series
            </Button>
            <p className="-mt-1 text-xs text-text-secondary">
              This and every other open occurrence, and no more will be created. Completed ones are kept.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setIsChoosingCancelScope(false)}>
              Keep deadline
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
