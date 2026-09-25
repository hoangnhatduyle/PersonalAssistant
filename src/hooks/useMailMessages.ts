import { useQuery } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { mailKeys } from "@/lib/query/keys";
import { MAIL_QUERY_STALE_TIME_MS } from "@/lib/mail/constants";
import type { MailProvider } from "@/lib/mail/types";
import type { MailMessagesResponse } from "@/app/api/mail/messages/route";

/** staleTime keeps this from refetching (and burning a call against checkMailApiRateLimit) on every remount/window-refocus within the window — 5 minutes of latency is an acceptable tradeoff for a personal inbox view. */
export function useMailMessages(provider: MailProvider) {
  return useQuery({
    queryKey: mailKeys.messages(provider),
    queryFn: async () =>
      (await apiFetch<MailMessagesResponse>(`/api/mail/messages${toQueryString({ provider })}`)).data,
    staleTime: MAIL_QUERY_STALE_TIME_MS,
  });
}
