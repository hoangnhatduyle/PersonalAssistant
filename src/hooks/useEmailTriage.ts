import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { mailKeys } from "@/lib/query/keys";
import { TRIAGE_QUERY_STALE_TIME_MS } from "@/lib/email-triage/constants";
import type { TriageListResponse, TriageRunResponse } from "@/lib/email-triage/types";
import type { MailProvider } from "@/lib/mail/types";

/** Stored triage results (a DB read: no mailbox or OpenAI calls). `scope: "all"` includes dismissed/acted items, for mail-card badges. */
export function useEmailTriage(scope: "open" | "all" = "open") {
  return useQuery({
    queryKey: mailKeys.triage(scope),
    queryFn: async () => (await apiFetch<TriageListResponse>(`/api/mail/triage${toQueryString({ scope })}`)).data.items,
    staleTime: TRIAGE_QUERY_STALE_TIME_MS,
  });
}

/** POST /api/mail/triage — a manual run. Never fired automatically. */
export function useRunEmailTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { provider: MailProvider; days: number }) =>
      (await apiFetch<TriageRunResponse>("/api/mail/triage", { method: "POST", body: input })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.triage() });
    },
  });
}

/** PATCH /api/mail/triage/[id] — dismiss an item, or mark it acted after its suggested action was confirmed. */
export function useUpdateTriageItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: "dismissed" | "acted" }) =>
      (
        await apiFetch<{ id: string; status: string }>(`/api/mail/triage/${encodeURIComponent(input.id)}`, {
          method: "PATCH",
          body: { status: input.status },
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.triage() });
    },
  });
}
