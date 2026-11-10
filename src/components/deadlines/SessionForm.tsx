"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ProgressField } from "@/components/ui/ProgressField";
import type { AppointmentRow } from "@/lib/api/entity-types";
import { resolveSessionProgress, toAutoProgress } from "@/lib/progress/resolve-progress";

export type SessionFormValues = {
  title: string;
  date: string;
  time?: string;
  duration_minutes?: number;
  /** Hand-set progress; only present when editing an existing session (a new one has none to record). */
  progress_percent?: number | null;
  progress_note?: string | null;
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
  const [progressPercent, setProgressPercent] = useState<number | null>(session?.progress_percent ?? null);
  const [progressNote, setProgressNote] = useState<string | null>(session?.progress_note ?? null);
  const [error, setError] = useState<string | null>(null);
  // What progress would be if the hand-set value were cleared (planned 0 %, done 100 %).
  const autoProgress = session ? toAutoProgress(resolveSessionProgress({ ...session, progress_percent: null })) : undefined;

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
      // Explicit nulls (not omitted) so clearing a hand-set value actually clears it.
      ...(session ? { progress_percent: progressPercent, progress_note: progressNote } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Title" htmlFor="session-title" error={!title.trim() ? error ?? undefined : undefined}>
        <Input id="session-title" placeholder="e.g. Draft outline" value={title} onChange={(event) => setTitle(event.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date" htmlFor="session-date" error={!date ? error ?? undefined : undefined}>
          <DatePicker id="session-date" value={date} onChange={setDate} />
        </FormField>
        <FormField label="Estimate (minutes)" htmlFor="session-duration">
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

      <FormField label="Time (optional)" htmlFor="session-time">
        <Input id="session-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
      </FormField>

      {session && (
        <ProgressField
          idPrefix="session"
          percent={progressPercent}
          note={progressNote}
          autoPercent={autoProgress?.percent}
          autoHint={autoProgress?.hint}
          onPercentChange={setProgressPercent}
          onNoteChange={setProgressNote}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
