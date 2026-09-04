"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { AppointmentRow } from "@/lib/api/entity-types";

export type SessionFormValues = {
  title: string;
  date: string;
  time?: string;
  duration_minutes?: number;
};

type Props = {
  session?: AppointmentRow;
  onSubmit: (values: SessionFormValues) => void;
  onCancel: () => void;
};

// No category picker (the server force-sets category: "Session") and no
// deadline_id field — the caller supplies deadline_id via the mutation call
// (see SessionsSection.tsx), never from this form.
export function SessionForm({ session, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(session?.title ?? "");
  const [date, setDate] = useState(session?.date ?? "");
  const [time, setTime] = useState(session?.time ?? "");
  const [durationMinutes, setDurationMinutes] = useState(session?.duration_minutes ? String(session.duration_minutes) : "");
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
      time: time.trim() || undefined,
      duration_minutes: durationMinutes.trim() ? Number(durationMinutes) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Title" htmlFor="session-title" error={!title.trim() ? error ?? undefined : undefined}>
        <Input id="session-title" placeholder="e.g. Draft outline" value={title} onChange={(event) => setTitle(event.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date" htmlFor="session-date" error={!date ? error ?? undefined : undefined}>
          <Input id="session-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Duration (minutes)" htmlFor="session-duration">
          <Input
            id="session-duration"
            type="number"
            min={1}
            placeholder="e.g. 90"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </FormField>
      </div>

      <FormField label="Time" htmlFor="session-time">
        <Input id="session-time" placeholder="e.g. Starting at 7:00 PM" value={time} onChange={(event) => setTime(event.target.value)} />
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
