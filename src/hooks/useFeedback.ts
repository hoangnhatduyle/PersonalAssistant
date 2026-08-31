import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { feedbackKeys } from "@/lib/query/keys";
import type { FeedbackPayload } from "@/lib/api/schemas";
import type { FeedbackRow } from "@/lib/api/entity-types";

/**
 * Lists the caller's own feedback history. No `?targetId=` filter exists on
 * the route (GET /api/feedback returns everything, own rows only) —
 * FeedbackControl filters this cache client-side per target.
 */
export function useFeedback() {
  return useQuery({
    queryKey: feedbackKeys.list(),
    queryFn: async () => (await apiFetch<FeedbackRow[]>("/api/feedback")).data,
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FeedbackPayload) =>
      (await apiFetch<FeedbackRow>("/api/feedback", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}

export function useDeleteFeedback(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/feedback/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}
