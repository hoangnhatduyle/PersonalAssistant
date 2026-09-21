import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import type { ApplicationStatus } from "@/lib/library/application-status";
import type { LibraryApplicationPatch, LibraryApplicationPayload } from "@/lib/api/library-schemas";
import type { LibraryApplicationWithEmployer } from "@/lib/api/entity-types";

export interface ApplicationListFilters {
  status?: ApplicationStatus;
  employerId?: string;
  page?: number;
  limit?: number;
}

export interface ApplicationsPage {
  rows: LibraryApplicationWithEmployer[];
  meta: { total: number; page: number; limit: number } | undefined;
}

export function useLibraryApplications(filters: ApplicationListFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: libraryKeys.applications(filters),
    queryFn: async (): Promise<ApplicationsPage> => {
      const { data, meta } = await apiFetch<LibraryApplicationWithEmployer[]>(`/api/library/applications${toQueryString({ ...filters })}`);
      return { rows: data, meta };
    },
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useCreateLibraryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryApplicationPayload) =>
      (await apiFetch<LibraryApplicationWithEmployer>("/api/library/applications", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateLibraryApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryApplicationPatch) =>
      (await apiFetch<LibraryApplicationWithEmployer>(`/api/library/applications/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useDeleteLibraryApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/library/applications/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

interface TransitionVariables {
  id: string;
  to: ApplicationStatus;
}

interface TransitionContext {
  snapshots: [QueryKey, ApplicationsPage | undefined][];
}

/**
 * Moves an application to another status (POST .../transition). Optimistic:
 * the card jumps columns immediately in every cached applications list, and
 * is rolled back — with a toast — if the server refuses. Always refetches
 * afterwards, since the server owns status_changed_at and the history.
 */
export function useApplicationTransition() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation<LibraryApplicationWithEmployer, Error, TransitionVariables, TransitionContext>({
    mutationFn: async ({ id, to }) =>
      (await apiFetch<LibraryApplicationWithEmployer>(`/api/library/applications/${id}/transition`, { method: "POST", body: { to } })).data,
    onMutate: async ({ id, to }) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.applicationsAll() });
      const snapshots = queryClient.getQueriesData<ApplicationsPage>({ queryKey: libraryKeys.applicationsAll() });
      const changedAt = new Date().toISOString();
      queryClient.setQueriesData<ApplicationsPage>({ queryKey: libraryKeys.applicationsAll() }, (page) =>
        page ? { ...page, rows: page.rows.map((row) => (row.id === id ? { ...row, status: to, status_changed_at: changedAt } : row)) } : page,
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
      showToast("Could not move that application", "error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
