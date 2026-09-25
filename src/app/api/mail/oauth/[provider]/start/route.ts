import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { mailProviderSchema } from "@/lib/api/schemas";
import { validationErrorResponse } from "@/lib/api/response";
import { generateOAuthNonce, setOAuthStateCookie } from "@/lib/mail/oauth-state";
import { buildGoogleAuthUrl } from "@/lib/mail/google/oauth";
import { buildMicrosoftAuthUrl } from "@/lib/mail/microsoft/oauth";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

/**
 * GET /api/mail/oauth/[provider]/start — begins the connect flow. Only the
 * fixed callback paths (/api/auth/google/callback, /api/auth/microsoft/callback)
 * are constrained by the providers' registered redirect URIs; this
 * initiating route isn't, so one dynamic route covers both providers.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;

  const { provider: providerParam } = await params;
  const parsed = mailProviderSchema.safeParse(providerParam);
  if (!parsed.success) return validationErrorResponse("Unknown mail provider");
  const provider = parsed.data;

  const redirectUri = new URL(`/api/auth/${provider}/callback`, request.nextUrl.origin).toString();
  const state = generateOAuthNonce();
  const authUrl = provider === "google" ? buildGoogleAuthUrl(redirectUri, state) : buildMicrosoftAuthUrl(redirectUri, state);

  const response = NextResponse.redirect(authUrl);
  setOAuthStateCookie(response, provider, state);
  return response;
}
