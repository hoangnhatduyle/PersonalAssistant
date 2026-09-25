import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { upsertMailAccount } from "@/lib/mail/accounts";
import { checkMailApiRateLimit } from "@/lib/mail/rate-limit";
import { clearOAuthStateCookie, validateOAuthState } from "@/lib/mail/oauth-state";
import { exchangeMicrosoftCode, getMicrosoftUserEmail } from "@/lib/mail/microsoft/oauth";

/**
 * GET /api/auth/microsoft/callback — fixed path, matches the redirect URI
 * registered on the Cadence Entra app exactly. Do not rename or move.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !validateOAuthState(request, "microsoft", state)) {
    const response = NextResponse.redirect(new URL("/?mail_error=microsoft", origin));
    clearOAuthStateCookie(response);
    return response;
  }

  // This call is about to hit Microsoft's token endpoint with our OAuth
  // client credentials, same abuse surface as GET /api/mail/messages's
  // refresh — rate-limit it too, so repeated hits with junk codes/state
  // can't spam it.
  const { allowed } = await checkMailApiRateLimit(supabase, user.id, "microsoft");
  if (!allowed) {
    const response = NextResponse.redirect(new URL("/?mail_error=microsoft", origin));
    clearOAuthStateCookie(response);
    return response;
  }

  const redirectUri = new URL("/api/auth/microsoft/callback", origin).toString();

  try {
    const { accessToken, refreshToken } = await exchangeMicrosoftCode(code, redirectUri);
    const email = await getMicrosoftUserEmail(accessToken);
    await upsertMailAccount(supabase, user.id, "microsoft", email, refreshToken);
  } catch (error) {
    console.error("microsoft oauth callback failed", error);
    const response = NextResponse.redirect(new URL("/?mail_error=microsoft", origin));
    clearOAuthStateCookie(response);
    return response;
  }

  const response = NextResponse.redirect(new URL("/?mail_connected=microsoft", origin));
  clearOAuthStateCookie(response);
  return response;
}
