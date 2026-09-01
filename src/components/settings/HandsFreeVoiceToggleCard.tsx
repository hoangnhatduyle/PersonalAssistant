"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

export function HandsFreeVoiceToggleCard() {
  const { data, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();

  const handleChange = async (checked: boolean) => {
    try {
      await updateSettings.mutateAsync({ hands_free_voice_enabled: checked });
      showToast(checked ? "Hands-free voice enabled" : "Hands-free voice disabled", "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="font-display text-sm font-medium text-text-primary">Hands-free voice</p>
      <p className="text-xs text-text-secondary">Re-arm the mic automatically after each spoken response, for a continuous conversation.</p>
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
          label="Enabled"
          aria-label="Hands-free voice enabled"
          checked={data.hands_free_voice_enabled}
          onChange={(event) => handleChange(event.target.checked)}
          disabled={updateSettings.isPending}
        />
      )}
    </GlassPanel>
  );
}
