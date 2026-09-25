import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { upsertMailAccount } from "@/lib/mail/accounts";
import { checkMailApiRateLimit } from "@/lib/mail/rate-limit";
import { clearOAuthStateCookie, validateOAuthState } from "@/lib/mail/oauth-state";
import { exchangeGoogleCode, getGoogleUserEmail } from "@/lib/mail/google/oauth";

/**
 * GET /api/auth/google/callback — fixed path, matches the redirect URI
 * registered on the Cadence Google OAuth app exactly. Do not rename or move.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !validateOAuthState(request, "google", state)) {
    const response = NextResponse.redirect(new URL("/?mail_error=google", origin));
    clearOAuthStateCookie(response);
    return response;
  }

  // This call is about to hit Google's token endpoint with our OAuth client
  // credentials, same abuse surface as GET /api/mail/messages's refresh —
  // rate-limit it too, so repeated hits with junk codes/state can't spam it.
  const { allowed } = await checkMailApiRateLimit(supabase, user.id, "google");
  if (!allowed) {
    const response = NextResponse.redirect(new URL("/?mail_error=google", origin));
    clearOAuthStateCookie(response);
    return response;
  }

  const redirectUri = new URL("/api/auth/google/callback", origin).toString();

  try {
    const { accessToken, refreshToken } = await exchangeGoogleCode(code, redirectUri);
    const email = await getGoogleUserEmail(accessToken);
    await upsertMailAccount(supabase, user.id, "google", email, refreshToken);
  } catch (error) {
    console.error("google oauth callback failed", error);
    const response = NextResponse.redirect(new URL("/?mail_error=google", origin));
    clearOAuthStateCookie(response);
    return response;
  }

  const response = NextResponse.redirect(new URL("/?mail_connected=google", origin));
  clearOAuthStateCookie(response);
  return response;
}
