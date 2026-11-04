"use client";

import { useMemo, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

function useTimeZoneOptions(currentValue: string): string[] {
  return useMemo(() => {
    const zones = Intl.supportedValuesOf("timeZone");
    // Guarantee the saved value renders even if it has since become an
    // unrecognized/legacy zone name (e.g. saved before an ICU data update).
    return zones.includes(currentValue) ? zones : [currentValue, ...zones];
  }, [currentValue]);
}

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function TimeZoneForm({ initialTimezone }: { initialTimezone: string }) {
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();
  const [timezone, setTimezone] = useState(initialTimezone);
  const options = useTimeZoneOptions(initialTimezone);
  const device = deviceTimeZone();

  const save = async (value: string) => {
    try {
      await updateSettings.mutateAsync({ timezone: value });
      showToast("Time zone saved", "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Time zone" htmlFor="settings-timezone">
          <Select id="settings-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="w-56">
            {options.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </FormField>
        <Button size="sm" onClick={() => save(timezone)} isLoading={updateSettings.isPending}>
          Save
        </Button>
      </div>
      {device !== initialTimezone ? (
        <div>
          <Button size="sm" variant="secondary" onClick={() => save(device)} disabled={updateSettings.isPending}>
            Use this device&apos;s time zone ({device})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TimeZoneCard() {
  const { data, isLoading, isError, refetch } = useSettings();

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-display text-sm font-medium text-text-primary">Time zone</p>
        <p className="text-xs text-text-secondary">Due dates, reminders and the voice assistant all use this zone.</p>
      </div>
      {isError ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-status-urgent">Couldn&apos;t load this setting.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-9 w-56" />
      ) : (
        // Keyed by the server value so a save (from here or another tab) remounts the form with the fresh zone.
        <TimeZoneForm key={data.timezone} initialTimezone={data.timezone} />
      )}
    </GlassPanel>
  );
}
