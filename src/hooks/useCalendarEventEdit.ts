import { useState } from "react";
import { useApplyCalendarEdit } from "@/hooks/useCalendarEdits";
import { useApplyOccurrenceEdit, type OccurrenceEdit, type OccurrenceParent } from "@/hooks/useOccurrenceEdits";
import { useToast } from "@/components/ui/Toast";
import type { CalendarEvent, RecurringOccurrenceRef } from "@/lib/calendar/build-week-events";
import { isSameTimes, type EventTimes } from "@/lib/calendar/drag-math";
import { buildCalendarEdit, isMoveIntoPast, type CalendarEdit } from "@/lib/calendar/edit-patches";
import { hasPatternChanged } from "@/lib/api/series-pattern";
import { applySeriesEdit } from "@/lib/calendar/series-edit";
import type { MeetingBlock } from "@/lib/calendar/recurrence";

/** A deadline/task move into the past, waiting for the user's confirmation. */
export interface PendingPastMove {
  edit: CalendarEdit;
  title: string;
}

/** A recurring course/appointment occurrence dropped somewhere new, waiting for "This occurrence / All occurrences". */
export interface PendingScope {
  event: CalendarEvent;
  times: EventTimes;
}

/** The weekly pattern (meeting_blocks) of the course/appointment a block belongs to, or null if it isn't loaded. */
export type SeriesBlocksLookup = (event: CalendarEvent) => MeetingBlock[] | null;

const parentOf = (event: CalendarEvent): OccurrenceParent | null =>
  event.kind === "course" ? "course" : event.kind === "recurring-appointment" ? "appointment" : null;

const revertRequest = (event: CalendarEvent, parent: OccurrenceParent, occurrence: RecurringOccurrenceRef): OccurrenceEdit => ({
  scope: "this",
  parent,
  id: event.entityId,
  originalDate: occurrence.originalDate,
  originalStartMinutes: occurrence.originalStartMinutes,
  change: { type: "revert" },
});

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" key, independent of any time zone. */
function dayOfWeekOf(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * What happens when a block is dropped, resized, or set from the time dialog:
 * a read-only block or a no-op is ignored; a deadline/task moved before now
 * waits for confirmation (it becomes overdue at once); a recurring
 * course/appointment waits for the user to pick "This occurrence" or "All
 * occurrences"; anything else is written immediately (optimistically — see
 * useApplyCalendarEdit).
 *
 * `timeZone` is the profile zone: deadlines/tasks are instants and are written
 * in the zone their due dates are shown in.
 */
export function useCalendarEventEdit(timeZone: string, getSeriesBlocks: SeriesBlocksLookup = () => null) {
  const apply = useApplyCalendarEdit();
  const applyOccurrence = useApplyOccurrenceEdit();
  const { showToast } = useToast();
  const [pending, setPending] = useState<PendingPastMove | null>(null);
  const [scope, setScope] = useState<PendingScope | null>(null);

  const commit = (event: CalendarEvent, times: EventTimes) => {
    if (!event.editable) return;
    const original: EventTimes = { date: event.occurrenceDate, startMinutes: event.startMinutes, endMinutes: event.endMinutes };
    if (isSameTimes(original, times)) return;

    if (event.occurrence && parentOf(event)) {
      setScope({ event, times });
      return;
    }

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

  /** "This occurrence": an exception for this date only — or, when dropped back on its series position, no exception at all. */
  const chooseThis = () => {
    if (!scope) return;
    const { event, times } = scope;
    const parent = parentOf(event);
    const occurrence = event.occurrence;
    setScope(null);
    if (!parent || !occurrence) return;
    const key = { scope: "this" as const, parent, id: event.entityId, originalDate: occurrence.originalDate, originalStartMinutes: occurrence.originalStartMinutes };
    const seriesBlock = event.blockIndex === null ? null : (getSeriesBlocks(event)?.[event.blockIndex] ?? null);
    const isBackOnSeries =
      seriesBlock !== null &&
      times.date === occurrence.originalDate &&
      times.startMinutes === seriesBlock.startMinutes &&
      times.endMinutes === seriesBlock.endMinutes;
    applyOccurrence.mutate(
      isBackOnSeries
        ? { ...key, change: { type: "revert" } }
        : { ...key, change: { type: "move", newDate: times.date, newStartMinutes: times.startMinutes, newEndMinutes: times.endMinutes } },
    );
  };

  /** "All occurrences": rewrite the weekly pattern — only the dragged weekday of its block. */
  const chooseAll = () => {
    if (!scope) return;
    const { event, times } = scope;
    const parent = parentOf(event);
    const occurrence = event.occurrence;
    const blocks = getSeriesBlocks(event);
    setScope(null);
    if (!parent || !occurrence || event.blockIndex === null || !blocks) return;
    const next = applySeriesEdit(blocks, {
      blockIndex: event.blockIndex,
      fromDayOfWeek: dayOfWeekOf(occurrence.originalDate),
      toDayOfWeek: dayOfWeekOf(times.date),
      startMinutes: times.startMinutes,
      endMinutes: times.endMinutes,
    });
    if (!next) {
      showToast("That change can't be made to the whole series", "error");
      return;
    }
    // Dropped where the pattern already has it (e.g. an adjusted day dragged back to its series slot): nothing to
    // rewrite, and the server would keep the exceptions — so "all" here can only mean "stop adjusting this day".
    if (!hasPatternChanged({ meeting_blocks: blocks, recurrence_start_date: null, recurrence_end_date: null }, { meeting_blocks: next })) {
      if (occurrence.isOverridden) applyOccurrence.mutate(revertRequest(event, parent, occurrence));
      return;
    }
    applyOccurrence.mutate({ scope: "all", parent, id: event.entityId, meetingBlocks: next });
  };

  const cancelScope = () => setScope(null);

  /** Cancel just this day (the series and every other day are untouched). The block leaves the grid, so the toast carries the way back. */
  const skip = (event: CalendarEvent) => {
    const parent = parentOf(event);
    const occurrence = event.occurrence;
    if (!event.editable || !parent || !occurrence) return;
    applyOccurrence.mutate({
      scope: "this",
      parent,
      id: event.entityId,
      originalDate: occurrence.originalDate,
      originalStartMinutes: occurrence.originalStartMinutes,
      change: { type: "cancel" },
    });
    showToast(`Skipped ${event.title}`, "info", { label: "Undo", onClick: () => applyOccurrence.mutate(revertRequest(event, parent, occurrence)) });
  };

  /** Drop this day's exception so it follows the series again. */
  const revert = (event: CalendarEvent) => {
    const parent = parentOf(event);
    if (!event.editable || !parent || !event.occurrence?.isOverridden) return;
    applyOccurrence.mutate(revertRequest(event, parent, event.occurrence));
  };

  return { commit, pending, confirmPending, cancelPending, scope, chooseThis, chooseAll, cancelScope, skip, revert };
}
