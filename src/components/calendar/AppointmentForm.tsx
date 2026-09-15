"use client";

import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { RecurrencePicker } from "@/components/recurrence/RecurrencePicker";
import { RecurrencePreview } from "@/components/recurrence/RecurrencePreview";
import { APPOINTMENT_CATEGORIES } from "@/lib/appointments/types";
import { splitLinks } from "@/lib/text/linkify";
import type { AppointmentRow } from "@/lib/api/entity-types";
import type { AppointmentPayload } from "@/lib/api/schemas";

// The subset of AppointmentPayload the Course-style recurrence editor
// (RecurrencePicker/RecurrencePreview) needs its own react-hook-form instance
// for. Kept separate from the rest of the appointment's fields (title, date,
// time, ...), which stay plain component state exactly as before this
// appointment recurrence feature — only these three fields need a real form
// context, since RecurrencePicker/RecurrencePreview are generic over
// RecurrenceFormFields and call useFormContext() internally.
type RecurrenceFields = Pick<AppointmentPayload, "meeting_blocks" | "recurrence_start_date" | "recurrence_end_date">;

// Matches CourseForm.tsx's DEFAULT_BLOCK: a brand-new recurring appointment
// starts with one blank block so the picker's sections are visible the
// moment "Recurring" is checked, instead of an empty state behind an
// "Add another time window" click.
const DEFAULT_BLOCK = { days: [] as number[], startMinutes: 9 * 60, endMinutes: 9 * 60 + 50 };

type Props = {
  appointment?: AppointmentRow;
  /** Pre-fills date/time when creating from a Calendar empty-slot click (src/components/calendar/CreateEventDialog.tsx). Ignored when editing an existing appointment. */
  defaultDate?: string;
  defaultTime?: string;
  onSubmit: (values: AppointmentPayload) => void;
  onCancel: () => void;
};

export function AppointmentForm({ appointment, defaultDate, defaultTime, onSubmit, onCancel }: Props) {
  const [isRecurring, setIsRecurring] = useState(() => (appointment?.meeting_blocks?.length ?? 0) > 0);
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [category, setCategory] = useState(appointment?.category ?? APPOINTMENT_CATEGORIES[0]);
  const [date, setDate] = useState(appointment?.date ?? defaultDate ?? "");
  // Structured HH:MM (not free text) — required so appointment-vs-appointment
  // conflict detection (src/lib/appointments/conflicts.ts) has a real start
  // time to compare, unlike a Deadline Session's free-text time.
  const [time, setTime] = useState(appointment?.time ?? defaultTime ?? "");
  const [duration, setDuration] = useState(
    appointment?.duration_minutes ? String(appointment.duration_minutes) : defaultTime ? "60" : "",
  );
  const [location, setLocation] = useState(appointment?.location ?? "");
  const [notes, setNotes] = useState((appointment?.notes ?? []).join("\n"));
  const [isEditingNotes, setIsEditingNotes] = useState(() => (appointment?.notes ?? []).length === 0);
  const [error, setError] = useState<string | null>(null);

  const recurrenceForm = useForm<RecurrenceFields>({
    defaultValues: {
      meeting_blocks:
        appointment?.meeting_blocks && appointment.meeting_blocks.length > 0 ? appointment.meeting_blocks : [DEFAULT_BLOCK],
      recurrence_start_date: appointment?.recurrence_start_date ?? null,
      recurrence_end_date: appointment?.recurrence_end_date ?? null,
    },
  });

  const durationMinutes = Number(duration);
  const isDurationValid = duration.trim() !== "" && Number.isInteger(durationMinutes) && durationMinutes > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    const parsedNotes = notes
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (isRecurring) {
      const { meeting_blocks, recurrence_start_date, recurrence_end_date } = recurrenceForm.getValues();
      onSubmit({
        title: title.trim(),
        // date stays required by the stored row (see 0035_appointment_recurrence.sql's
        // comment) even though it's not user-facing here — recurrence_start_date
        // (or today, if that's also unset) stands in for it.
        date: recurrence_start_date ?? new Date().toISOString().slice(0, 10),
        category,
        time: null,
        duration_minutes: null,
        location: location.trim() || undefined,
        notes: parsedNotes,
        meeting_blocks,
        recurrence_start_date,
        recurrence_end_date,
      });
      return;
    }

    if (!date || !time || !isDurationValid) {
      setError("Date, time, and duration are required.");
      return;
    }
    onSubmit({
      title: title.trim(),
      date,
      category,
      time,
      duration_minutes: durationMinutes,
      location: location.trim() || undefined,
      notes: parsedNotes,
      meeting_blocks: [],
      recurrence_start_date: null,
      recurrence_end_date: null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Title" htmlFor="appointment-title" error={!title.trim() ? error ?? undefined : undefined}>
        <Input id="appointment-title" placeholder="e.g. Dentist Appointment" value={title} onChange={(event) => setTitle(event.target.value)} />
      </FormField>

      <Checkbox label="Recurring" checked={isRecurring} onChange={(event) => setIsRecurring(event.target.checked)} />

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Category" htmlFor="appointment-category">
          <Select id="appointment-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {APPOINTMENT_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Location" htmlFor="appointment-location">
          <Input id="appointment-location" placeholder="e.g. Baldwin Hall 544" value={location} onChange={(event) => setLocation(event.target.value)} />
        </FormField>
      </div>

      {isRecurring ? (
        <FormProvider {...recurrenceForm}>
          <div className="grid gap-4 lg:grid-cols-2">
            <RecurrencePicker<RecurrenceFields> />
            <RecurrencePreview<RecurrenceFields> />
          </div>
        </FormProvider>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" htmlFor="appointment-date" error={!date ? error ?? undefined : undefined}>
              <Input id="appointment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </FormField>
            <FormField label="Time" htmlFor="appointment-time" error={!time ? error ?? undefined : undefined}>
              <Input id="appointment-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
            </FormField>
          </div>
          <FormField label="Duration (minutes)" htmlFor="appointment-duration" error={!isDurationValid ? error ?? undefined : undefined}>
            <Input
              id="appointment-duration"
              type="number"
              min={1}
              step={5}
              required
              placeholder="e.g. 60"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </FormField>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="appointment-notes" className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
            Notes (one item per line)
          </label>
          <button
            type="button"
            onClick={() => setIsEditingNotes((current) => !current)}
            className="font-mono text-[10px] uppercase tracking-wide text-accent-indigo hover:underline"
          >
            {isEditingNotes ? "Preview" : "Edit"}
          </button>
        </div>
        {isEditingNotes ? (
          <textarea
            id="appointment-notes"
            rows={5}
            placeholder="Optional details, one per line"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-control border border-panel-border bg-bg-void-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-indigo/50 focus:border-panel-border-hover"
          />
        ) : (
          <div className="flex min-h-[3rem] flex-col gap-1 rounded-control border border-panel-border bg-bg-void px-3 py-2 text-sm text-text-secondary">
            {notes
              .split("\n")
              .filter((line) => line.trim() !== "")
              .map((line, lineIndex) => (
                <p key={lineIndex} className="break-words">
                  {splitLinks(line).map((segment, segmentIndex) =>
                    segment.isLink ? (
                      <a
                        key={segmentIndex}
                        href={segment.text}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-indigo hover:underline"
                      >
                        {segment.text}
                      </a>
                    ) : (
                      <span key={segmentIndex}>{segment.text}</span>
                    ),
                  )}
                </p>
              ))}
            {notes.trim() === "" && <p className="italic">No notes</p>}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
