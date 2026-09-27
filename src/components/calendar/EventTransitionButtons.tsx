"use client";

import { useTransitionAppointment } from "@/hooks/useAppointments";
import { getValidEventEvents, type EventTransitionEvent } from "@/lib/api/transitions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { EventStatus } from "@/lib/api/entity-types";

const EVENT_LABELS: Record<EventTransitionEvent, string> = {
  user_marks_event_done: "Mark Done",
  user_marks_event_missed: "Mark Missed",
};

const EVENT_ICONS: Record<EventTransitionEvent, string> = {
  user_marks_event_done: "✓",
  user_marks_event_missed: "✕",
};

/**
 * Inline status-transition buttons for a general Event/Appointment —
 * structurally identical to SessionTransitionButtons
 * (src/components/deadlines/SessionsSection.tsx), plus one thing Sessions
 * don't need: `suggestMissed`, a visual nudge (not an auto-apply) toward
 * "Mark Missed" when the caller has already determined this event has a
 * Course Conflict — the user structurally couldn't attend, but the status
 * change still requires their own click.
 *
 * `status` and `occurrenceDate` are resolved by the parent (via
 * resolveDisplayedEventStatus/resolveAppointmentOccurrence, src/lib/appointments/occurrence-status.ts)
 * rather than read from `appointment.event_status` directly here — for a
 * recurring appointment, that column is frozen at 'planned' and never
 * reflects any occurrence's real status, so gating on it directly would let
 * every occurrence show both buttons forever regardless of what's already
 * been marked. `occurrenceDate` is non-null only for a recurring
 * appointment's resolved occurrence, and is threaded straight into the
 * transition mutation — the API route requires it for exactly that case
 * (POST /api/appointments/[id]/transition).
 *
 * `compact` swaps the labeled buttons for icon-only ones (for dense list
 * rows like UpNextPanel) — full text still reaches screen readers and
 * hover via aria-label/title.
 */
export function EventTransitionButtons({
  appointmentId,
  status,
  occurrenceDate = null,
  suggestMissed = false,
  size = "sm",
  compact = false,
}: {
  appointmentId: string;
  status: EventStatus | null;
  occurrenceDate?: string | null;
  suggestMissed?: boolean;
  size?: "sm" | "lg";
  compact?: boolean;
}) {
  const events = status ? getValidEventEvents(status) : [];
  const transition = useTransitionAppointment(appointmentId);
  const { showToast } = useToast();

  if (events.length === 0) return null;

  const handleTransition = async (event: EventTransitionEvent) => {
    try {
      await transition.mutateAsync({ event, occurrenceDate });
      showToast("Event updated", "success");
    } catch {
      showToast("Could not update event", "error");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {events.map((event) => {
        const isSuggestedMissed = suggestMissed && event === "user_marks_event_missed";
        const label = `${EVENT_LABELS[event]}${isSuggestedMissed ? " (Suggested)" : ""}`;
        return (
          <Button
            key={event}
            size={compact ? "icon" : size === "lg" ? "md" : "sm"}
            variant={isSuggestedMissed ? "primary" : event === "user_marks_event_missed" ? "destructive" : "success"}
            isLoading={transition.isPending}
            onClick={() => handleTransition(event)}
            className={size === "lg" ? "px-6 py-3 text-base" : ""}
            aria-label={label}
            title={label}
          >
            {compact ? EVENT_ICONS[event] : label}
          </Button>
        );
      })}
    </div>
  );
}
