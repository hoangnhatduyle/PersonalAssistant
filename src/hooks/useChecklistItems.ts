import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { checklistItemKeys, taskKeys } from "@/lib/query/keys";
import type { ChecklistItemPatch, ChecklistItemPayload } from "@/lib/api/schemas";
import type { ChecklistItemRow } from "@/lib/api/entity-types";

export function useChecklistItems(taskId: string) {
  return useQuery({
    queryKey: checklistItemKeys.list({ taskId }),
    queryFn: async () =>
      (await apiFetch<ChecklistItemRow[]>(`/api/checklist-items${toQueryString({ taskId })}`)).data,
    enabled: Boolean(taskId),
  });
}

export function useCreateChecklistItem(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChecklistItemPayload) =>
      (await apiFetch<ChecklistItemRow>("/api/checklist-items", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: checklistItemKeys.list({ taskId }) });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    },
  });
}

export function useUpdateChecklistItem(id: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChecklistItemPatch) =>
      (await apiFetch<ChecklistItemRow>(`/api/checklist-items/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: checklistItemKeys.list({ taskId }) });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    },
  });
}

export function useDeleteChecklistItem(id: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/checklist-items/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: checklistItemKeys.list({ taskId }) });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    },
  });
}
