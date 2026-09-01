import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { todoItemKeys, todoListKeys } from "@/lib/query/keys";
import type { TodoListPatch, TodoListPayload } from "@/lib/api/schemas";
import type { TodoListRow } from "@/lib/api/entity-types";

export interface TodoListListFilters {
  courseId?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface TodoListDeleteResult {
  id: string;
  cascade: { itemsDeleted: number };
}

export function useTodoLists(filters?: TodoListListFilters) {
  return useQuery({
    queryKey: todoListKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<TodoListRow[]>(`/api/todo-lists${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useTodoList(id: string) {
  return useQuery({
    queryKey: todoListKeys.detail(id),
    queryFn: async () => (await apiFetch<TodoListRow>(`/api/todo-lists/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateTodoList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TodoListPayload) =>
      (await apiFetch<TodoListRow>("/api/todo-lists", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoListKeys.all });
    },
  });
}

export function useUpdateTodoList(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TodoListPatch) =>
      (await apiFetch<TodoListRow>(`/api/todo-lists/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoListKeys.all });
    },
  });
}

export function useDeleteTodoList(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<TodoListDeleteResult>(`/api/todo-lists/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // Removed, not just invalidated — see useDeleteTask's onSuccess for why.
      queryClient.removeQueries({ queryKey: todoListKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: todoListKeys.all });
      queryClient.invalidateQueries({ queryKey: todoItemKeys.all });
    },
  });
}
