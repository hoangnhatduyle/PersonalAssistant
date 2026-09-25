import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { mailProviderSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, rateLimitedResponse, serverErrorResponse } from "@/lib/api/response";
import { getMailAccount } from "@/lib/mail/accounts";
import { checkMailApiRateLimit } from "@/lib/mail/rate-limit";
import { MailReauthRequiredError } from "@/lib/mail/errors";
import type { MailMessage } from "@/lib/mail/types";
import { refreshGoogleAccessToken } from "@/lib/mail/google/oauth";
import { listGoogleMessages } from "@/lib/mail/google/client";
import { refreshMicrosoftAccessToken } from "@/lib/mail/microsoft/oauth";
import { listMicrosoftMessages } from "@/lib/mail/microsoft/client";

export interface MailMessagesResponse {
  connected: boolean;
  needsReauth: boolean;
  messages: MailMessage[];
}

/**
 * GET /api/mail/messages?provider=google|microsoft — lists recent messages.
 * A refresh token is never persisted as an access token: each call exchanges
 * it for a fresh access token (Phase-1 request volume is low — dashboard
 * load + manual refresh — so this is simpler than tracking expiry).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = mailProviderSchema.safeParse(request.nextUrl.searchParams.get("provider"));
  if (!parsed.success) return validationErrorResponse("provider must be 'google' or 'microsoft'");
  const provider = parsed.data;

  try {
    const account = await getMailAccount(supabase, user.id, provider);
    if (!account) {
      return successResponse<MailMessagesResponse>({ connected: false, needsReauth: false, messages: [] });
    }

    // Only from here on does this route call out to the provider's own
    // token/mail-list endpoints — rate-limit those, not the "not connected"
    // no-op path above.
    const { allowed } = await checkMailApiRateLimit(supabase, user.id, provider);
    if (!allowed) return rateLimitedResponse();

    const accessToken =
      provider === "google"
        ? await refreshGoogleAccessToken(account.refreshToken)
        : await refreshMicrosoftAccessToken(account.refreshToken);

    const messages = provider === "google" ? await listGoogleMessages(accessToken) : await listMicrosoftMessages(accessToken);

    return successResponse<MailMessagesResponse>({ connected: true, needsReauth: false, messages });
  } catch (error) {
    if (error instanceof MailReauthRequiredError) {
      return successResponse<MailMessagesResponse>({ connected: true, needsReauth: true, messages: [] });
    }
    return serverErrorResponse(`${provider} mail messages fetch failed`, error);
  }
}
