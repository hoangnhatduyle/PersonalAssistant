import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import type { LibraryInterviewPatch, LibraryInterviewPayload } from "@/lib/api/library-schemas";
import type { LibraryInterviewWithPerson, LibraryTimelineEntry } from "@/lib/api/entity-types";

export function useLibraryInterviews(applicationId: string) {
  return useQuery({
    queryKey: libraryKeys.interviews(applicationId),
    queryFn: async () => (await apiFetch<LibraryInterviewWithPerson[]>(`/api/library/applications/${applicationId}/interviews`)).data,
    enabled: Boolean(applicationId),
  });
}

/** Status history + interviews merged on one rail (the application timeline). */
export function useApplicationTimeline(applicationId: string) {
  return useQuery({
    queryKey: libraryKeys.timeline(applicationId),
    queryFn: async () => (await apiFetch<LibraryTimelineEntry[]>(`/api/library/applications/${applicationId}/timeline`)).data,
    enabled: Boolean(applicationId),
  });
}

// Interviews feed both the log and the timeline, so every mutation invalidates the Library cache.

export function useCreateInterview(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryInterviewPayload) =>
      (await apiFetch<LibraryInterviewWithPerson>(`/api/library/applications/${applicationId}/interviews`, { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LibraryInterviewPatch }) =>
      (await apiFetch<LibraryInterviewWithPerson>(`/api/library/interviews/${id}`, { method: "PATCH", body: patch })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useDeleteInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiFetch<{ id: string }>(`/api/library/interviews/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
