import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import type { LibraryContactPatch, LibraryContactPayload } from "@/lib/api/library-schemas";
import type { LibraryEmployerContact } from "@/lib/api/entity-types";

// Contacts are embedded in the employer list/detail queries, so every mutation
// just invalidates the Library cache.

export function useAddEmployerContact(employerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LibraryContactPayload) =>
      (await apiFetch<LibraryEmployerContact>(`/api/library/employers/${employerId}/contacts`, { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateEmployerContact(employerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ personId, patch }: { personId: string; patch: LibraryContactPatch }) =>
      (await apiFetch<LibraryEmployerContact>(`/api/library/employers/${employerId}/contacts/${personId}`, { method: "PATCH", body: patch })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useRemoveEmployerContact(employerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string) =>
      (await apiFetch<{ employer_id: string; person_id: string }>(`/api/library/employers/${employerId}/contacts/${personId}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
