"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useApplyPersonalizationSuggestion, useDismissPersonalizationSuggestion } from "@/hooks/usePersonalizationSuggestions";
import type { PersonalizationSuggestionRow } from "@/lib/api/entity-types";

type Props = {
  suggestion: PersonalizationSuggestionRow;
  targetTitle: string;
};

/** Buttons only render while pending (SPEC-CORE-007: never auto-applied — mirrors ReminderCard's Acknowledge/Dismiss gating). */
export function PersonalizationSuggestionCard({ suggestion, targetTitle }: Props) {
  const apply = useApplyPersonalizationSuggestion(suggestion.id);
  const dismiss = useDismissPersonalizationSuggestion(suggestion.id);
  const { showToast } = useToast();

  const handleApply = async () => {
    try {
      await apply.mutateAsync();
      showToast("Suggestion applied", "success");
    } catch {
      showToast("Could not apply suggestion", "error");
    }
  };

  const handleDismiss = async () => {
    try {
      await dismiss.mutateAsync();
      showToast("Suggestion dismissed", "success");
    } catch {
      showToast("Could not dismiss suggestion", "error");
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-display text-base font-medium text-text-primary">{targetTitle}</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          Reminder lead time: {suggestion.from_value}m &rarr; {suggestion.to_value}m
        </p>
      </div>
      <p className="text-sm text-text-secondary">{suggestion.rationale}</p>
      {suggestion.status === "pending" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" isLoading={apply.isPending} disabled={dismiss.isPending} onClick={handleApply}>
            Apply
          </Button>
          <Button size="sm" variant="secondary" isLoading={dismiss.isPending} disabled={apply.isPending} onClick={handleDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}
