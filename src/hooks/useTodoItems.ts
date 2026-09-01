import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { todoItemKeys } from "@/lib/query/keys";
import type { TodoItemPatch, TodoItemPayload } from "@/lib/api/schemas";
import type { TodoItemRow } from "@/lib/api/entity-types";

export interface TodoItemListFilters {
  listId?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export function useTodoItems(filters?: TodoItemListFilters) {
  return useQuery({
    queryKey: todoItemKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<TodoItemRow[]>(`/api/todo-items${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useTodoItem(id: string) {
  return useQuery({
    queryKey: todoItemKeys.detail(id),
    queryFn: async () => (await apiFetch<TodoItemRow>(`/api/todo-items/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateTodoItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TodoItemPayload) =>
      (await apiFetch<TodoItemRow>("/api/todo-items", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoItemKeys.all });
    },
  });
}

export function useUpdateTodoItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TodoItemPatch) =>
      (await apiFetch<TodoItemRow>(`/api/todo-items/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoItemKeys.all });
    },
  });
}

export function useDeleteTodoItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/todo-items/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: todoItemKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: todoItemKeys.all });
    },
  });
}
