"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

const MIN_MINUTES = 0;
const MAX_MINUTES = 1440;

function ReminderCadenceForm({ initialMinutes }: { initialMinutes: number }) {
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();
  const [minutes, setMinutes] = useState(initialMinutes);

  const handleSave = async () => {
    const clamped = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes));
    try {
      await updateSettings.mutateAsync({ default_reminder_lead_minutes: clamped });
      showToast("Reminder cadence saved", "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <div className="flex items-end gap-3">
      <FormField label="Minutes before" htmlFor="reminder-lead-minutes">
        <Input
          id="reminder-lead-minutes"
          type="number"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={minutes}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) setMinutes(parsed);
          }}
          className="w-28"
        />
      </FormField>
      <Button size="sm" onClick={handleSave} isLoading={updateSettings.isPending}>
        Save
      </Button>
    </div>
  );
}

export function ReminderCadenceCard() {
  const { data, isLoading, isError, refetch } = useSettings();

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-display text-sm font-medium text-text-primary">Default reminder lead time</p>
        <p className="text-xs text-text-secondary">
          Not yet consumed by course/deadline creation (each still sets its own lead time) — stored for future use.
        </p>
      </div>
      {isError ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-status-urgent">Couldn&apos;t load this setting.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-9 w-40" />
      ) : (
        // Keyed by the server value itself: a save from a *different* card
        // (e.g. VoiceCaptureToggleCard) refreshes this same query's cache
        // via setQueryData, but since default_reminder_lead_minutes didn't
        // change, the key doesn't change and this form's in-progress edit
        // survives. If this field's value ever does change server-side
        // (another tab, or this card's own successful save), the key
        // changes and the form remounts with the fresh value — closing a
        // real bug typescript-reviewer found: a stale local copy could
        // otherwise silently re-save an outdated number over a newer one.
        <ReminderCadenceForm key={data.default_reminder_lead_minutes} initialMinutes={data.default_reminder_lead_minutes} />
      )}
    </GlassPanel>
  );
}
