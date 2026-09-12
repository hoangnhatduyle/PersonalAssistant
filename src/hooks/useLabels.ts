import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { labelKeys, taskKeys } from "@/lib/query/keys";
import type { LabelPatch, LabelPayload } from "@/lib/api/schemas";
import type { LabelRow } from "@/lib/api/entity-types";

export interface LabelListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface LabelDeleteResult {
  id: string;
  cascade: { tasksUnlinked: number };
}

export function useLabels(filters?: LabelListFilters) {
  return useQuery({
    queryKey: labelKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<LabelRow[]>(`/api/labels${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LabelPayload) => (await apiFetch<LabelRow>("/api/labels", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}

export function useUpdateLabel(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LabelPatch) =>
      (await apiFetch<LabelRow>(`/api/labels/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
      // A label's name/color is denormalized into every task's joined
      // task_labels(label:...) response — refresh the board too.
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useDeleteLabel(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<LabelDeleteResult>(`/api/labels/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: labelKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
