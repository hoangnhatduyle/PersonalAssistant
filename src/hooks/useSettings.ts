import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { settingsKeys } from "@/lib/query/keys";
import type { UserPreferences } from "@/lib/api/entity-types";
import type { UserPreferencesPatch } from "@/lib/api/schemas";

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => (await apiFetch<UserPreferences>("/api/settings")).data,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UserPreferencesPatch) =>
      (await apiFetch<UserPreferences>("/api/settings", { method: "PATCH", body: patch })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.all, data);
    },
  });
}
