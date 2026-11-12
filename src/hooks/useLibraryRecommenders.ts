import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import type {
  LibraryRecommenderLetterPatch,
  LibraryRecommenderLetterPayload,
  LibraryRecommenderPatch,
  LibraryRecommenderPayload,
} from "@/lib/api/library-schemas";
import type { LibraryRecommender, LibraryRecommenderLetter } from "@/lib/api/entity-types";

export function useLibraryRecommenders() {
  return useQuery({
    queryKey: libraryKeys.recommenders(),
    queryFn: async () => (await apiFetch<LibraryRecommender[]>("/api/library/recommenders")).data,
  });
}

// Letters are embedded in the recommenders list, so every mutation refreshes that one query.
function useInvalidateRecommenders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: libraryKeys.recommenders() });
}

export function useCreateRecommender() {
  const invalidate = useInvalidateRecommenders();
  return useMutation({
    mutationFn: async (payload: LibraryRecommenderPayload) =>
      (await apiFetch<LibraryRecommender>("/api/library/recommenders", { method: "POST", body: payload })).data,
    onSuccess: invalidate,
  });
}

export function useUpdateRecommender() {
  const invalidate = useInvalidateRecommenders();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LibraryRecommenderPatch }) =>
      (await apiFetch<LibraryRecommender>(`/api/library/recommenders/${id}`, { method: "PATCH", body: patch })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteRecommender() {
  const invalidate = useInvalidateRecommenders();
  return useMutation({
    mutationFn: async (id: string) => (await apiFetch<{ id: string }>(`/api/library/recommenders/${id}`, { method: "DELETE" })).data,
    onSuccess: invalidate,
  });
}

export function useCreateRecommenderLetter() {
  const invalidate = useInvalidateRecommenders();
  return useMutation({
    mutationFn: async ({ recommenderId, payload }: { recommenderId: string; payload: LibraryRecommenderLetterPayload }) =>
      (await apiFetch<LibraryRecommenderLetter>(`/api/library/recommenders/${recommenderId}/letters`, { method: "POST", body: payload })).data,
    onSuccess: invalidate,
  });
}

export function useUpdateRecommenderLetter() {
  const invalidate = useInvalidateRecommenders();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LibraryRecommenderLetterPatch }) =>
      (await apiFetch<LibraryRecommenderLetter>(`/api/library/recommender-letters/${id}`, { method: "PATCH", body: patch })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteRecommenderLetter() {
  const invalidate = useInvalidateRecommenders();
  return useMutation({
    mutationFn: async (id: string) => (await apiFetch<{ id: string }>(`/api/library/recommender-letters/${id}`, { method: "DELETE" })).data,
    onSuccess: invalidate,
  });
}
