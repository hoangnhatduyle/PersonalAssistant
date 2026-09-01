"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { APPOINTMENT_CATEGORIES, type Appointment } from "@/lib/appointments/types";

export type AppointmentFormValues = Omit<Appointment, "id" | "createdAt">;

type Props = {
  appointment?: Appointment;
  onSubmit: (values: AppointmentFormValues) => void;
  onCancel: () => void;
};

export function AppointmentForm({ appointment, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [date, setDate] = useState(appointment?.date ?? "");
  const [category, setCategory] = useState(appointment?.category ?? APPOINTMENT_CATEGORIES[0]);
  const [time, setTime] = useState(appointment?.time ?? "");
  const [location, setLocation] = useState(appointment?.location ?? "");
  const [notes, setNotes] = useState((appointment?.notes ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !date) {
      setError("Title and date are required.");
      return;
    }
    onSubmit({
      title: title.trim(),
      date,
      category,
      time: time.trim() || undefined,
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
        <FormField label="Time" htmlFor="appointment-time">
          <Input id="appointment-time" placeholder="e.g. Arrive by 9:00 AM" value={time} onChange={(event) => setTime(event.target.value)} />
        </FormField>
        <FormField label="Location" htmlFor="appointment-location">
          <Input id="appointment-location" placeholder="e.g. Baldwin Hall 544" value={location} onChange={(event) => setLocation(event.target.value)} />
        </FormField>
      </div>

      <FormField label="Notes (one item per line)" htmlFor="appointment-notes">
        <textarea
          id="appointment-notes"
          rows={3}
          placeholder="Optional details, one per line"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-control border border-panel-border bg-bg-void-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-indigo/50 focus:border-panel-border-hover"
        />
      </FormField>
      <p className="-mt-2 text-xs text-text-secondary">Saved locally in this browser only — not synced anywhere.</p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
