import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import { serializeLibraryPostFilters, type LibraryPostFilters } from "@/lib/library/filters";
import type { LibraryPostPatch, LibraryPostPayload } from "@/lib/api/library-schemas";
import type { LibraryPost, LibraryPostWithRelations, LibraryTagCount } from "@/lib/api/entity-types";

export function useLibraryPosts(filters: LibraryPostFilters) {
  return useQuery({
    queryKey: libraryKeys.posts(filters),
    queryFn: async () => {
      const query = serializeLibraryPostFilters(filters).toString();
      const { data, meta } = await apiFetch<LibraryPostWithRelations[]>(`/api/library/posts${query ? `?${query}` : ""}`);
      return { rows: data, meta };
    },
    // Search-as-you-type: keep showing the previous page while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useLibraryPost(id: string) {
  return useQuery({
    queryKey: libraryKeys.post(id),
    queryFn: async () => (await apiFetch<LibraryPostWithRelations>(`/api/library/posts/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useLibraryTags() {
  return useQuery({
    queryKey: libraryKeys.tags(),
    queryFn: async () => (await apiFetch<LibraryTagCount[]>("/api/library/tags")).data,
  });
}

export function useCreateLibraryPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryPostPayload) =>
      (await apiFetch<LibraryPostWithRelations>("/api/library/posts", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateLibraryPost(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryPostPatch) =>
      (await apiFetch<LibraryPostWithRelations>(`/api/library/posts/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useDeleteLibraryPost(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/library/posts/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // Drop the detail first so the still-mounted detail page can't refetch a 404.
      queryClient.removeQueries({ queryKey: libraryKeys.post(id) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export type { LibraryPost };
