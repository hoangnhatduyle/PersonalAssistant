import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { courseKeys, personalizationSuggestionKeys, reminderKeys, taskKeys } from "@/lib/query/keys";
import { applyPersonalizationSuggestion, dismissPersonalizationSuggestion } from "@/lib/api/suggestions-client";
import type { PersonalizationSuggestionRow, PersonalizationSuggestionStatus } from "@/lib/api/entity-types";

export interface PersonalizationSuggestionListFilters {
  status?: PersonalizationSuggestionStatus[];
  page?: number;
  limit?: number;
}

export interface GenerateSuggestionsResult {
  candidatesEvaluated: number;
  created: number;
  skipped: number;
}

export function usePersonalizationSuggestions(filters?: PersonalizationSuggestionListFilters) {
  return useQuery({
    queryKey: personalizationSuggestionKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<PersonalizationSuggestionRow[]>(`/api/suggestions${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

/** On-demand only — never polled/scheduled, since each call costs an LLM request. */
export function useGenerateSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<GenerateSuggestionsResult>("/api/suggestions/generate", { method: "POST" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personalizationSuggestionKeys.all });
    },
  });
}

export function useApplyPersonalizationSuggestion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => applyPersonalizationSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personalizationSuggestionKeys.all });
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      // Applying changes reminder_lead_minutes, which recomputes trigger_at
      // on every affected live Reminder.
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useDismissPersonalizationSuggestion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dismissPersonalizationSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personalizationSuggestionKeys.all });
    },
  });
}
