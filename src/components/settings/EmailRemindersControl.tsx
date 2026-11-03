"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

/** The email half of the Reminder notifications card: an account-wide choice. */
export function EmailRemindersControl() {
  const { data, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();

  const handleChange = async (checked: boolean) => {
    try {
      await updateSettings.mutateAsync({ email_reminders_enabled: checked });
      showToast(checked ? "Email reminders enabled" : "Email reminders disabled", "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {isError ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-status-urgent">Couldn&apos;t load this setting.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-5 w-32" />
      ) : (
        <Checkbox
          label="Email me"
          aria-label="Email reminders enabled"
          checked={data.email_reminders_enabled}
          onChange={(event) => handleChange(event.target.checked)}
          disabled={updateSettings.isPending}
        />
      )}
    </div>
  );
}
