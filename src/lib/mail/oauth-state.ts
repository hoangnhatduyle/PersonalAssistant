import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { MailProvider } from "@/lib/mail/types";

const COOKIE_NAME = "mail_oauth_state";
const MAX_AGE_SECONDS = 300;

export function generateOAuthNonce(): string {
  return randomBytes(16).toString("hex");
}

/** Sets a short-lived, httpOnly CSRF-state cookie (`provider:nonce`) on the given response. Lax, not Strict, is required — the provider's callback redirect is a cross-site top-level navigation. */
export function setOAuthStateCookie(response: NextResponse, provider: MailProvider, nonce: string): void {
  response.cookies.set(COOKIE_NAME, `${provider}:${nonce}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

/** Validates the callback's `state` query param against the cookie set by setOAuthStateCookie, scoped to the expected provider. */
export function validateOAuthState(request: NextRequest, expectedProvider: MailProvider, stateParam: string | null): boolean {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue || !stateParam) return false;
  const [provider, nonce] = cookieValue.split(":");
  return provider === expectedProvider && nonce === stateParam;
}

export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}
