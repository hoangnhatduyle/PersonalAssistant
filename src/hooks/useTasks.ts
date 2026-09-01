import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { noteKeys, reminderKeys, taskKeys } from "@/lib/query/keys";
import type { TaskPatch, TaskPayload } from "@/lib/api/schemas";
import type { TaskRow } from "@/lib/api/entity-types";
import type { TaskTransitionEvent } from "@/lib/api/transitions";

export interface TaskListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  /** "me" for the account owner's own tasks, or a People row's id (People feature). */
  personId?: string;
}

export interface TaskDeleteResult {
  id: string;
  cascade: { notesUnlinked: number };
}

export function useTasks(filters?: TaskListFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<TaskRow[]>(`/api/tasks${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: async () => (await apiFetch<TaskRow>(`/api/tasks/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TaskPayload) => (await apiFetch<TaskRow>("/api/tasks", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TaskPatch) => (await apiFetch<TaskRow>(`/api/tasks/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useTransitionTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: TaskTransitionEvent) =>
      (await apiFetch<TaskRow>(`/api/tasks/${id}/transition`, { method: "POST", body: { event } })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useDeleteTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<TaskDeleteResult>(`/api/tasks/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // Removed, not just invalidated: invalidating taskKeys.all also matches
      // this row's now-404ing detail key, and a detail page's still-mounted
      // useTask(id) would refetch it before the post-delete redirect commits.
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
