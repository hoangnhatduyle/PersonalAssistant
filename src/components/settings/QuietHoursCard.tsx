"use client";

import { useMemo, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

function useTimeZoneOptions(currentValue: string): string[] {
  return useMemo(() => {
    const zones = Intl.supportedValuesOf("timeZone");
    // Guarantee the current value renders even if it's since become an
    // unrecognized/legacy zone name (e.g. saved before an ICU data update).
    return zones.includes(currentValue) ? zones : [currentValue, ...zones];
  }, [currentValue]);
}

function QuietHoursForm({
  initialStart,
  initialEnd,
  initialTimezone,
}: {
  initialStart: string;
  initialEnd: string;
  initialTimezone: string;
}) {
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [timezone, setTimezone] = useState(initialTimezone);
  const timeZoneOptions = useTimeZoneOptions(initialTimezone);

  const handleSave = async () => {
    const trimmedStart = start.trim();
    const trimmedEnd = end.trim();
    const bothEmpty = trimmedStart === "" && trimmedEnd === "";
    const bothSet = trimmedStart !== "" && trimmedEnd !== "";
    if (!bothEmpty && !bothSet) {
      showToast("Set both a start and end time, or clear both", "error");
      return;
    }
    try {
      await updateSettings.mutateAsync({
        quiet_hours_start: bothEmpty ? null : trimmedStart,
        quiet_hours_end: bothEmpty ? null : trimmedEnd,
        timezone,
      });
      showToast("Quiet hours saved", "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label="Start" htmlFor="quiet-hours-start">
        <Input id="quiet-hours-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} className="w-32" />
      </FormField>
      <FormField label="End" htmlFor="quiet-hours-end">
        <Input id="quiet-hours-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="w-32" />
      </FormField>
      <FormField label="Time zone" htmlFor="quiet-hours-timezone">
        <Select id="quiet-hours-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="w-48">
          {timeZoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </FormField>
      <Button size="sm" onClick={handleSave} isLoading={updateSettings.isPending}>
        Save
      </Button>
    </div>
  );
}

export function QuietHoursCard() {
  const { data, isLoading, isError, refetch } = useSettings();

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-display text-sm font-medium text-text-primary">Quiet hours</p>
        <p className="text-xs text-text-secondary">Stored for reference — reminder delivery timing doesn&apos;t read this yet.</p>
      </div>
      {isError ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-status-urgent">Couldn&apos;t load this setting.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        // Keyed by the server values themselves — see ReminderCadenceCard's
        // comment for why: prevents a sibling card's save from silently
        // going stale-then-clobbering this card's in-progress edit, while
        // still re-syncing if these values genuinely change server-side.
        <QuietHoursForm
          key={`${data.quiet_hours_start ?? ""}-${data.quiet_hours_end ?? ""}-${data.timezone}`}
          initialStart={data.quiet_hours_start?.slice(0, 5) ?? ""}
          initialEnd={data.quiet_hours_end?.slice(0, 5) ?? ""}
          initialTimezone={data.timezone}
        />
      )}
    </GlassPanel>
  );
}
