import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { checklistItemKeys, taskKeys } from "@/lib/query/keys";
import type { ChecklistItemPatch, ChecklistItemPayload } from "@/lib/api/schemas";
import type { ChecklistItemRow } from "@/lib/api/entity-types";
import type { ChecklistSummaryRow } from "@/lib/progress/checklist-summary";

export function useChecklistItems(taskId: string) {
  return useQuery({
    queryKey: checklistItemKeys.list({ taskId }),
    queryFn: async () =>
      (await apiFetch<ChecklistItemRow[]>(`/api/checklist-items${toQueryString({ taskId })}`)).data,
    enabled: Boolean(taskId),
  });
}

/** done/total per card for every card, so a list of cards can show checklist progress without one request each. */
export function useChecklistSummary() {
  return useQuery({
    queryKey: checklistItemKeys.summary(),
    queryFn: async () => (await apiFetch<ChecklistSummaryRow[]>("/api/checklist-items/summary")).data,
  });
}

// Every checklist mutation also refreshes the per-card tallies (same prefix, so a plain
// `checklistItemKeys.summary()` invalidation); list({ taskId }) alone would leave them stale.
function invalidateChecklistQueries(queryClient: ReturnType<typeof useQueryClient>, taskId: string) {
  queryClient.invalidateQueries({ queryKey: checklistItemKeys.list({ taskId }) });
  queryClient.invalidateQueries({ queryKey: checklistItemKeys.summary() });
  queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
}

export function useCreateChecklistItem(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChecklistItemPayload) =>
      (await apiFetch<ChecklistItemRow>("/api/checklist-items", { method: "POST", body: payload })).data,
    onSuccess: () => invalidateChecklistQueries(queryClient, taskId),
  });
}

export function useUpdateChecklistItem(id: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChecklistItemPatch) =>
      (await apiFetch<ChecklistItemRow>(`/api/checklist-items/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => invalidateChecklistQueries(queryClient, taskId),
  });
}

export function useDeleteChecklistItem(id: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/checklist-items/${id}`, { method: "DELETE" })).data,
    onSuccess: () => invalidateChecklistQueries(queryClient, taskId),
  });
}
