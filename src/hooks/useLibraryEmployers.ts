import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import { serializeEmployerFilters, type LibraryEmployerFilters } from "@/lib/library/employer-filters";
import type { LibraryEmployerPatch, LibraryEmployerPayload } from "@/lib/api/library-schemas";
import type { LibraryEmployerDetail, LibraryEmployerListItem } from "@/lib/api/entity-types";

export interface EmployerCascade {
  applications: number;
  interviews: number;
  contacts: number;
  postLinks: number;
}

/** `view` (list vs board) is UI-only: it must not fragment the cache or reach the API. */
function withoutView(filters: LibraryEmployerFilters): Omit<LibraryEmployerFilters, "view"> {
  const rest = { ...filters };
  delete rest.view;
  return rest;
}

export function useLibraryEmployers(filters: LibraryEmployerFilters, options: { enabled?: boolean } = {}) {
  const apiFilters = withoutView(filters);
  return useQuery({
    queryKey: libraryKeys.employers(apiFilters),
    queryFn: async () => {
      const query = serializeEmployerFilters(apiFilters, { includeView: false }).toString();
      const { data, meta } = await apiFetch<LibraryEmployerListItem[]>(`/api/library/employers${query ? `?${query}` : ""}`);
      return { rows: data, meta };
    },
    enabled: options.enabled ?? true,
    // Search-as-you-type: keep showing the previous page while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useLibraryEmployer(id: string) {
  return useQuery({
    queryKey: libraryKeys.employer(id),
    queryFn: async () => (await apiFetch<LibraryEmployerDetail>(`/api/library/employers/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateLibraryEmployer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryEmployerPayload) =>
      (await apiFetch<LibraryEmployerDetail>("/api/library/employers", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateLibraryEmployer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryEmployerPatch) =>
      (await apiFetch<LibraryEmployerDetail>(`/api/library/employers/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useDeleteLibraryEmployer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string; cascade: EmployerCascade }>(`/api/library/employers/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // Drop the detail first so the still-mounted detail page can't refetch a 404.
      queryClient.removeQueries({ queryKey: libraryKeys.employer(id) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
