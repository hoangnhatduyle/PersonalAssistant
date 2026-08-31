import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { deadlineKeys, reminderKeys } from "@/lib/query/keys";
import type { DeadlinePatch, DeadlinePayload } from "@/lib/api/schemas";
import type { DeadlineRow } from "@/lib/api/entity-types";
import type { DeadlineTransitionEvent } from "@/lib/api/transitions";

export interface DeadlineListFilters {
  courseId?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export function useDeadlines(filters?: DeadlineListFilters) {
  return useQuery({
    queryKey: deadlineKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<DeadlineRow[]>(`/api/deadlines${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useDeadline(id: string) {
  return useQuery({
    queryKey: deadlineKeys.detail(id),
    queryFn: async () => (await apiFetch<DeadlineRow>(`/api/deadlines/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DeadlinePayload) =>
      (await apiFetch<DeadlineRow>("/api/deadlines", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useUpdateDeadline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DeadlinePatch) =>
      (await apiFetch<DeadlineRow>(`/api/deadlines/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useTransitionDeadline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: DeadlineTransitionEvent) =>
      (await apiFetch<DeadlineRow>(`/api/deadlines/${id}/transition`, { method: "POST", body: { event } })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useDeleteDeadline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // No cascade block: only the deadline's own reminder is silently
    // dismissed by a DB trigger, nothing cross-entity to disclose.
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/deadlines/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // Removed, not just invalidated — see useDeleteTask's onSuccess for why.
      queryClient.removeQueries({ queryKey: deadlineKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}
