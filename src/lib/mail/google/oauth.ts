import { requireEnv } from "@/lib/env";
import { MailReauthRequiredError } from "@/lib/mail/errors";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// gmail.readonly + email — no gmail.send, replies stay manual (see project
// memory). `email` is required for the userinfo call below (getGoogleUserEmail)
// to identify which account was connected; gmail.readonly alone returns 401
// from that endpoint.
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly email";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // offline + consent so Google actually issues a refresh_token (it's
    // omitted on repeat consents without this).
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && text.includes("invalid_grant")) {
      throw new MailReauthRequiredError("google");
    }
    throw new Error(`Google token endpoint returned ${response.status}: ${text}`);
  }
  return response.json();
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const data = await postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh_token — retry the consent flow (access_type=offline&prompt=consent)");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const data = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  );
  return data.access_token;
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google userinfo endpoint returned ${response.status}`);
  }
  const data: { email: string } = await response.json();
  return data.email;
}
