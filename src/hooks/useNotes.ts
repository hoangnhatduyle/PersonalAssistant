import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { noteKeys } from "@/lib/query/keys";
import type { NotePatch, NotePayload } from "@/lib/api/schemas";
import type { NoteRow } from "@/lib/api/entity-types";

export interface NoteListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export function useNotes(filters?: NoteListFilters) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<NoteRow[]>(`/api/notes${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: async () => (await apiFetch<NoteRow>(`/api/notes/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: NotePayload) => (await apiFetch<NoteRow>("/api/notes", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: NotePatch) => (await apiFetch<NoteRow>(`/api/notes/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useDeleteNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/notes/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
