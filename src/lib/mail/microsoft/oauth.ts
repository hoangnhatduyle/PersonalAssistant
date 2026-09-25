import { requireEnv } from "@/lib/env";
import { MailReauthRequiredError } from "@/lib/mail/errors";

// /consumers (not /common) restricts sign-in to personal Microsoft accounts
// only — a stronger guarantee than /common that the UC tenant can never
// appear in this flow. The connected mailbox is always the user's personal
// Outlook.com account (UC mail reaches it via a forwarding rule) — see
// project memory for why.
const AUTH_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";

// Mail.Read + offline_access + User.Read — no Mail.Send, replies stay
// manual. User.Read is required for the Graph /me call below
// (getMicrosoftUserEmail) to identify which account was connected; without
// it, /me returns 403 even though Mail.Read alone is enough to list messages.
const SCOPE = "offline_access Mail.Read User.Read";

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export function buildMicrosoftAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("MICROSOFT_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPE,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<MicrosoftTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && text.includes("invalid_grant")) {
      throw new MailReauthRequiredError("microsoft");
    }
    throw new Error(`Microsoft token endpoint returned ${response.status}: ${text}`);
  }
  return response.json();
}

export async function exchangeMicrosoftCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const data = await postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPE,
    }),
  );
  if (!data.refresh_token) {
    throw new Error("Microsoft did not return a refresh_token — retry the consent flow");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<string> {
  const data = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
      grant_type: "refresh_token",
      scope: SCOPE,
    }),
  );
  return data.access_token;
}

export async function getMicrosoftUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(`${GRAPH_ME_URL}?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Microsoft Graph /me returned ${response.status}`);
  }
  const data: { mail?: string; userPrincipalName?: string } = await response.json();
  const email = data.mail ?? data.userPrincipalName;
  if (!email) throw new Error("Microsoft Graph /me returned no mail or userPrincipalName");
  return email;
}
