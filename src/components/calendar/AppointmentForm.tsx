"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { APPOINTMENT_CATEGORIES } from "@/lib/appointments/types";
import { splitLinks, containsLink } from "@/lib/text/linkify";
import type { AppointmentRow } from "@/lib/api/entity-types";

export type AppointmentFormValues = {
  title: string;
  date: string;
  category: string;
  time: string;
  duration_minutes: number;
  location?: string;
  notes?: string[];
};

type Props = {
  appointment?: AppointmentRow;
  onSubmit: (values: AppointmentFormValues) => void;
  onCancel: () => void;
};

export function AppointmentForm({ appointment, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [date, setDate] = useState(appointment?.date ?? "");
  const [category, setCategory] = useState(appointment?.category ?? APPOINTMENT_CATEGORIES[0]);
  // Structured HH:MM (not free text) — required so appointment-vs-appointment
  // conflict detection (src/lib/appointments/conflicts.ts) has a real start
  // time to compare, unlike a Deadline Session's free-text time.
  const [time, setTime] = useState(appointment?.time ?? "");
  const [duration, setDuration] = useState(appointment?.duration_minutes ? String(appointment.duration_minutes) : "");
  const [location, setLocation] = useState(appointment?.location ?? "");
  const [notes, setNotes] = useState((appointment?.notes ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);

  const durationMinutes = Number(duration);
  const isDurationValid = duration.trim() !== "" && Number.isInteger(durationMinutes) && durationMinutes > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !date || !time || !isDurationValid) {
      setError("Title, date, time, and duration are required.");
      return;
    }
    onSubmit({
      title: title.trim(),
      date,
      category,
      time,
      duration_minutes: durationMinutes,
      location: location.trim() || undefined,
      notes: notes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Title" htmlFor="appointment-title" error={!title.trim() ? error ?? undefined : undefined}>
        <Input id="appointment-title" placeholder="e.g. Dentist Appointment" value={title} onChange={(event) => setTitle(event.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date" htmlFor="appointment-date" error={!date ? error ?? undefined : undefined}>
          <Input id="appointment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Category" htmlFor="appointment-category">
          <Select id="appointment-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {APPOINTMENT_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Time" htmlFor="appointment-time" error={!time ? error ?? undefined : undefined}>
          <Input id="appointment-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
        </FormField>
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
      </div>

      <FormField label="Location" htmlFor="appointment-location">
        <Input id="appointment-location" placeholder="e.g. Baldwin Hall 544" value={location} onChange={(event) => setLocation(event.target.value)} />
      </FormField>

      <FormField label="Notes (one item per line)" htmlFor="appointment-notes">
        <textarea
          id="appointment-notes"
          rows={5}
          placeholder="Optional details, one per line"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-control border border-panel-border bg-bg-void-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-indigo/50 focus:border-panel-border-hover"
        />
        {containsLink(notes) && (
          <div className="mt-2 flex flex-col gap-1 rounded-control border border-panel-border bg-bg-void px-3 py-2 text-sm text-text-secondary">
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
          </div>
        )}
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
