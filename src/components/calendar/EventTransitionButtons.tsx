"use client";

import { useTransitionAppointment } from "@/hooks/useAppointments";
import { getValidEventEvents, type EventTransitionEvent } from "@/lib/api/transitions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { AppointmentRow } from "@/lib/api/entity-types";

const EVENT_LABELS: Record<EventTransitionEvent, string> = {
  user_marks_event_done: "Mark Done",
  user_marks_event_missed: "Mark Missed",
};

/**
 * Inline status-transition buttons for a general Event/Appointment —
 * structurally identical to SessionTransitionButtons
 * (src/components/deadlines/SessionsSection.tsx), plus one thing Sessions
 * don't need: `suggestMissed`, a visual nudge (not an auto-apply) toward
 * "Mark Missed" when the caller has already determined this event has a
 * Course Conflict — the user structurally couldn't attend, but the status
 * change still requires their own click.
 */
export function EventTransitionButtons({
  appointment,
  suggestMissed = false,
  size = "sm",
}: {
  appointment: AppointmentRow;
  suggestMissed?: boolean;
  size?: "sm" | "lg";
}) {
  const events = appointment.event_status ? getValidEventEvents(appointment.event_status) : [];
  const transition = useTransitionAppointment(appointment.id);
  const { showToast } = useToast();

  if (events.length === 0) return null;

  const handleTransition = async (event: EventTransitionEvent) => {
    try {
      await transition.mutateAsync(event);
      showToast("Event updated", "success");
    } catch {
      showToast("Could not update event", "error");
    }
  };

  return (
    <div className={`flex gap-2 ${size === "lg" ? "flex-wrap" : ""}`}>
      {events.map((event) => {
        const isSuggestedMissed = suggestMissed && event === "user_marks_event_missed";
        return (
          <Button
            key={event}
            size={size === "lg" ? "md" : "sm"}
            variant={isSuggestedMissed ? "primary" : event === "user_marks_event_missed" ? "secondary" : "primary"}
            isLoading={transition.isPending}
            onClick={() => handleTransition(event)}
            className={size === "lg" ? "px-6 py-3 text-base" : ""}
          >
            {EVENT_LABELS[event]}
            {isSuggestedMissed ? " (Suggested)" : ""}
          </Button>
        );
      })}
    </div>
  );
}
