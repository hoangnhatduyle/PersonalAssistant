"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

export function SpeakSuggestionsToggleCard() {
  const { data, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();

  const handleChange = async (checked: boolean) => {
    try {
      await updateSettings.mutateAsync({ speak_suggestions_aloud: checked });
      showToast(checked ? "Speak suggestions aloud enabled" : "Speak suggestions aloud disabled", "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="font-display text-sm font-medium text-text-primary">Speak suggestions aloud</p>
      <p className="text-xs text-text-secondary">
        When checking for suggestions, also speak each one and listen for a yes/no to apply or skip it.
      </p>
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
          aria-label="Speak suggestions aloud enabled"
          checked={data.speak_suggestions_aloud}
          onChange={(event) => handleChange(event.target.checked)}
          disabled={updateSettings.isPending}
        />
      )}
    </GlassPanel>
  );
}
