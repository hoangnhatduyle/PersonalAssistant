import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftAccessToken,
  getMicrosoftUserEmail,
} from "./oauth";
import { MailReauthRequiredError } from "@/lib/mail/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("microsoft oauth", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MICROSOFT_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("builds an auth URL against the /consumers tenant with Mail.Read + offline_access + User.Read", () => {
    const url = buildMicrosoftAuthUrl("https://app.example/api/auth/microsoft/callback", "state-abc");
    expect(url.startsWith("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize")).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("scope")).toBe("offline_access Mail.Read User.Read");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
  });

  it("exchanges an authorization code for an access + refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer" }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeMicrosoftCode("auth-code", "https://app.example/callback");

    expect(result).toEqual({ accessToken: "at", refreshToken: "rt" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://login.microsoftonline.com/consumers/oauth2/v2.0/token");
  });

  it("throws when Microsoft omits the refresh_token", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: "at", expires_in: 3600, token_type: "Bearer" })) as unknown as typeof fetch;

    await expect(exchangeMicrosoftCode("auth-code", "https://app.example/callback")).rejects.toThrow(/refresh_token/);
  });

  it("refreshes an access token from a refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: "new-at", expires_in: 3600, token_type: "Bearer" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(refreshMicrosoftAccessToken("rt")).resolves.toBe("new-at");
  });

  it("throws MailReauthRequiredError when the token endpoint reports invalid_grant", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("invalid_grant", { status: 400 })) as unknown as typeof fetch;

    await expect(refreshMicrosoftAccessToken("revoked-rt")).rejects.toThrow(MailReauthRequiredError);
  });

  it("fetches the connected account's email, falling back to userPrincipalName", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ userPrincipalName: "user@outlook.com" })) as unknown as typeof fetch;
    await expect(getMicrosoftUserEmail("at")).resolves.toBe("user@outlook.com");
  });
});
