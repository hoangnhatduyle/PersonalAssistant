import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { mailKeys } from "@/lib/query/keys";
import type { MailProvider } from "@/lib/mail/types";
import type { MailAccountSummary } from "@/app/api/mail/accounts/route";

export function useMailAccounts() {
  return useQuery({
    queryKey: mailKeys.accounts(),
    queryFn: async () => (await apiFetch<MailAccountSummary[]>("/api/mail/accounts")).data,
  });
}

export function useDisconnectMailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: MailProvider) =>
      (await apiFetch<{ provider: MailProvider }>(`/api/mail/accounts/${provider}`, { method: "DELETE" })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: mailKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: mailKeys.messages(result.provider) });
    },
  });
}
