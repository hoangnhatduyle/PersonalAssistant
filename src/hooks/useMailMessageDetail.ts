import { useQuery } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { mailKeys } from "@/lib/query/keys";
import { MAIL_QUERY_STALE_TIME_MS } from "@/lib/mail/constants";
import type { MailProvider } from "@/lib/mail/types";
import type { MailMessageDetailResponse } from "@/app/api/mail/messages/[id]/route";

/**
 * enabled: Boolean(id) so a message's body is only fetched once the dialog
 * actually opens, not eagerly per row. staleTime means reopening the same
 * message within 5 minutes reuses the cached body instead of spending
 * another call against checkMailApiRateLimit.
 */
export function useMailMessageDetail(provider: MailProvider, id: string | undefined) {
  return useQuery({
    queryKey: mailKeys.messageDetail(provider, id ?? ""),
    queryFn: async () =>
      (await apiFetch<MailMessageDetailResponse>(`/api/mail/messages/${id}${toQueryString({ provider })}`)).data,
    enabled: Boolean(id),
    staleTime: MAIL_QUERY_STALE_TIME_MS,
  });
}
