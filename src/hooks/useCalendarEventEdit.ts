import { useState } from "react";
import { useApplyCalendarEdit } from "@/hooks/useCalendarEdits";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";
import { isSameTimes, type EventTimes } from "@/lib/calendar/drag-math";
import { buildCalendarEdit, isMoveIntoPast, type CalendarEdit } from "@/lib/calendar/edit-patches";

/** A deadline/task move into the past, waiting for the user's confirmation. */
export interface PendingPastMove {
  edit: CalendarEdit;
  title: string;
}

/**
 * What happens when a block is dropped, resized, or set from the time dialog:
 * a read-only block or a no-op is ignored; a deadline/task moved before now
 * waits for confirmation (it becomes overdue at once); anything else is
 * written immediately (optimistically — see useApplyCalendarEdit).
 *
 * `timeZone` is the profile zone: deadlines/tasks are instants and are written
 * in the zone their due dates are shown in.
 */
export function useCalendarEventEdit(timeZone: string) {
  const apply = useApplyCalendarEdit();
  const [pending, setPending] = useState<PendingPastMove | null>(null);

  const commit = (event: CalendarEvent, times: EventTimes) => {
    if (!event.editable) return;
    const original: EventTimes = { date: event.occurrenceDate, startMinutes: event.startMinutes, endMinutes: event.endMinutes };
    if (isSameTimes(original, times)) return;

    const edit = buildCalendarEdit(event, times, timeZone);
    if (!edit) return;
    if (isMoveIntoPast(edit, new Date())) {
      setPending({ edit, title: event.title });
      return;
    }
    apply.mutate(edit);
  };

  const confirmPending = () => {
    if (pending) apply.mutate(pending.edit);
    setPending(null);
  };

  const cancelPending = () => setPending(null);

  return { commit, pending, confirmPending, cancelPending };
}
