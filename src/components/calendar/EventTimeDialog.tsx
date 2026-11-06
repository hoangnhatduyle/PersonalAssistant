"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";
import type { EventTimes } from "@/lib/calendar/drag-math";
import { minutesToTimeKey } from "@/lib/calendar/edit-patches";
import { parseTimeToMinutes } from "@/lib/calendar/recurrence";

type Props = {
  /** The block to adjust; null keeps the dialog closed. */
  event: CalendarEvent | null;
  onSave: (event: CalendarEvent, times: EventTimes) => void;
  /** Recurring occurrences only: cancel just this day. */
  onSkip?: (event: CalendarEvent) => void;
  /** Recurring occurrences only: drop this day's exception so it follows the weekly pattern again. */
  onRevert?: (event: CalendarEvent) => void;
  onClose: () => void;
};

const DAY_MINUTES = 24 * 60;

/**
 * Sets a calendar block's date and time from a form: the way to edit on a
 * phone (touch doesn't drag) and from a keyboard, and the same change a drag
 * makes. An appointment gets Start and End; a deadline or task is a point in
 * time, so it gets a single Time.
 */
export function EventTimeDialog({ event, onSave, onSkip, onRevert, onClose }: Props) {
  if (!event) return null;
  return (
    <Dialog open onClose={onClose} title="Adjust time">
      <TimeForm key={event.id} event={event} onSave={onSave} onSkip={onSkip} onRevert={onRevert} onClose={onClose} />
    </Dialog>
  );
}

function TimeForm({ event, onSave, onSkip, onRevert, onClose }: { event: CalendarEvent; onSave: Props["onSave"]; onSkip: Props["onSkip"]; onRevert: Props["onRevert"]; onClose: () => void }) {
  const isPoint = event.kind === "deadline" || event.kind === "task";
  const [date, setDate] = useState(event.occurrenceDate);
  const [startMinutes, setStartMinutes] = useState(event.startMinutes);
  const [endMinutes, setEndMinutes] = useState(event.endMinutes);
  const [errors, setErrors] = useState<{ date?: string; end?: string }>({});

  // Moving the start carries the end with it, so the duration (or a marker's drawn length) is kept.
  const handleStartChange = (value: string) => {
    const next = parseTimeToMinutes(value);
    if (next === null) return;
    setEndMinutes((end) => Math.min(end + (next - startMinutes), DAY_MINUTES));
    setStartMinutes(next);
  };

  const handleEndChange = (value: string) => {
    const next = parseTimeToMinutes(value);
    if (next !== null) setEndMinutes(next);
  };

  const handleSubmit = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const nextErrors: { date?: string; end?: string } = {};
    if (!date) nextErrors.date = "Choose a date.";
    if (!isPoint && endMinutes <= startMinutes) nextErrors.end = "End must be after the start.";
    setErrors(nextErrors);
    if (nextErrors.date || nextErrors.end) return;
    onSave(event, { date, startMinutes, endMinutes });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm font-medium text-text-primary">{event.title}</p>

      <FormField label="Date" htmlFor="event-time-date" error={errors.date}>
        <DatePicker id="event-time-date" value={date} onChange={setDate} invalid={Boolean(errors.date)} />
      </FormField>

      <div className={isPoint ? "" : "grid grid-cols-2 gap-4"}>
        <FormField label={isPoint ? "Time" : "Start"} htmlFor="event-time-start">
          <Input id="event-time-start" type="time" value={minutesToTimeKey(startMinutes)} onChange={(changeEvent) => handleStartChange(changeEvent.target.value)} />
        </FormField>
        {!isPoint && (
          <FormField label="End" htmlFor="event-time-end" error={errors.end}>
            <Input
              id="event-time-end"
              type="time"
              invalid={Boolean(errors.end)}
              value={minutesToTimeKey(endMinutes)}
              onChange={(changeEvent) => handleEndChange(changeEvent.target.value)}
            />
          </FormField>
        )}
      </div>

      {event.occurrence && (onSkip || onRevert) && (
        <div className="flex flex-wrap gap-2">
          {onSkip && (
            <Button type="button" variant="ghost" onClick={() => onSkip(event)}>
              Skip this day
            </Button>
          )}
          {onRevert && event.occurrence.isOverridden && (
            <Button type="button" variant="ghost" onClick={() => onRevert(event)}>
              Revert to series
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
