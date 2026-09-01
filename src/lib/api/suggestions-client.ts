import { apiFetch } from "@/lib/http/client";
import type { PersonalizationSuggestionRow } from "@/lib/api/entity-types";

/**
 * Plain (non-hook) apply/dismiss calls — used by src/hooks/
 * useReviewSuggestionsAloud.ts, whose review loop calls these inside an
 * imperative for-loop over N suggestions, where the per-id hook factories
 * below (useApplyPersonalizationSuggestion(id) etc.) can't be used: hooks
 * can't be called conditionally or inside a loop. Also the mutationFn body
 * for those hooks, so the fetch logic isn't duplicated.
 */
export async function applyPersonalizationSuggestion(id: string): Promise<PersonalizationSuggestionRow> {
  return (await apiFetch<PersonalizationSuggestionRow>(`/api/suggestions/${id}/apply`, { method: "POST" })).data;
}

export async function dismissPersonalizationSuggestion(id: string): Promise<PersonalizationSuggestionRow> {
  return (await apiFetch<PersonalizationSuggestionRow>(`/api/suggestions/${id}/dismiss`, { method: "POST" })).data;
}
