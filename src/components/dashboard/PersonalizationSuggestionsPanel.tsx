"use client";

import { useCourses } from "@/hooks/useCourses";
import { useTasks } from "@/hooks/useTasks";
import { useSettings } from "@/hooks/useSettings";
import { useGenerateSuggestions, usePersonalizationSuggestions } from "@/hooks/usePersonalizationSuggestions";
import { useReviewSuggestionsAloud } from "@/hooks/useReviewSuggestionsAloud";
import { PersonalizationSuggestionCard } from "@/components/personalization/PersonalizationSuggestionCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { resolveTargetTitle } from "@/lib/personalization/target-title";

/**
 * On-demand only — generation never runs on a timer (each check costs an
 * LLM request), so this panel always shows its own "Check for suggestions"
 * trigger rather than being a purely passive display like SuggestionBanner.
 * Self-contained: fetches its own pending suggestions plus the Course/Task
 * rows needed to resolve target titles, independent of DashboardContainer's
 * own loading gate, so the button stays clickable immediately.
 */
export function PersonalizationSuggestionsPanel() {
  const { data: suggestions, refetch: refetchSuggestions } = usePersonalizationSuggestions({ status: ["pending"] });
  const { data: courses } = useCourses();
  const { data: tasks } = useTasks();
  const { data: settings } = useSettings();
  const generate = useGenerateSuggestions();
  const reviewAloud = useReviewSuggestionsAloud();
  const { showToast } = useToast();

  const handleGenerate = async () => {
    try {
      const result = await generate.mutateAsync();
      showToast(
        result.created > 0
          ? `Found ${result.created} new suggestion${result.created === 1 ? "" : "s"}`
          : "Nothing new right now",
        "success",
      );
      // Deliberate exception to "only speak when the input was voice" — the
      // user explicitly opted a button tap into speaking via this setting.
      if (settings?.speak_suggestions_aloud) {
        const { data: fresh } = await refetchSuggestions();
        if (fresh && fresh.rows.length > 0) await reviewAloud.start(fresh.rows);
      }
    } catch {
      showToast("Could not check for suggestions", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Personalization</p>
        <Button size="sm" variant="secondary" isLoading={generate.isPending || reviewAloud.isActive} onClick={handleGenerate}>
          {reviewAloud.isActive ? "Listening…" : "Check for suggestions"}
        </Button>
      </div>
      {(suggestions?.rows.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3">
          {suggestions?.rows.map((suggestion) => (
            <PersonalizationSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              targetTitle={resolveTargetTitle(suggestion.scope, suggestion.target_id, courses?.rows ?? [], tasks?.rows ?? [])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
