import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { mailProviderSchema } from "@/lib/api/schemas";
import {
  successResponse,
  validationErrorResponse,
  rateLimitedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { getMailAccount } from "@/lib/mail/accounts";
import { checkMailApiRateLimit } from "@/lib/mail/rate-limit";
import { MailReauthRequiredError } from "@/lib/mail/errors";
import { sanitizeEmailHtml, sanitizePlainTextAsEmailHtml } from "@/lib/mail/sanitize-email-html";
import type { MailMessageDetail } from "@/lib/mail/types";
import { refreshGoogleAccessToken } from "@/lib/mail/google/oauth";
import { getGoogleMessageDetail } from "@/lib/mail/google/client";
import { refreshMicrosoftAccessToken } from "@/lib/mail/microsoft/oauth";
import { getMicrosoftMessageDetail } from "@/lib/mail/microsoft/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export interface MailMessageDetailResponse {
  needsReauth: boolean;
  message: MailMessageDetail | null;
}

/**
 * GET /api/mail/messages/[id]?provider=google|microsoft — fetches one
 * message's full (sanitized) body. Mirrors src/app/api/mail/messages/route.ts's
 * exact pattern: same auth/rate-limit/token-refresh/reauth handling, one
 * more provider call per open rather than a persisted body cache (see the
 * plan's "Explicitly out of scope" — bodies are always fetched fresh).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { id: messageId } = await params;

  const parsed = mailProviderSchema.safeParse(request.nextUrl.searchParams.get("provider"));
  if (!parsed.success) return validationErrorResponse("provider must be 'google' or 'microsoft'");
  const provider = parsed.data;

  try {
    const account = await getMailAccount(supabase, user.id, provider);
    if (!account) return notFoundResponse();

    const { allowed } = await checkMailApiRateLimit(supabase, user.id, provider);
    if (!allowed) return rateLimitedResponse();

    const accessToken =
      provider === "google"
        ? await refreshGoogleAccessToken(account.refreshToken)
        : await refreshMicrosoftAccessToken(account.refreshToken);

    const detail =
      provider === "google"
        ? await getGoogleMessageDetail(accessToken, messageId)
        : await getMicrosoftMessageDetail(accessToken, messageId);

    const sanitizedBodyHtml = detail.html
      ? sanitizeEmailHtml(detail.html)
      : sanitizePlainTextAsEmailHtml(detail.text ?? "");

    return successResponse<MailMessageDetailResponse>({
      needsReauth: false,
      message: {
        id: messageId,
        provider,
        subject: detail.subject,
        from: detail.from,
        receivedAt: detail.receivedAt,
        webLink: detail.webLink,
        sanitizedBodyHtml,
      },
    });
  } catch (error) {
    if (error instanceof MailReauthRequiredError) {
      return successResponse<MailMessageDetailResponse>({ needsReauth: true, message: null });
    }
    return serverErrorResponse(`${provider} mail message detail fetch failed`, error);
  }
}
