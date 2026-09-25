import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGoogleAuthUrl, exchangeGoogleCode, refreshGoogleAccessToken, getGoogleUserEmail } from "./oauth";
import { MailReauthRequiredError } from "@/lib/mail/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("google oauth", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("builds an auth URL requesting offline access, consent, gmail.readonly, and email", () => {
    const url = buildGoogleAuthUrl("https://app.example/api/auth/google/callback", "state-123");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.example/api/auth/google/callback");
    expect(parsed.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly email");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges an authorization code for an access + refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer" }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeGoogleCode("auth-code", "https://app.example/callback");

    expect(result).toEqual({ accessToken: "at", refreshToken: "rt" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("throws when Google omits the refresh_token", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: "at", expires_in: 3600, token_type: "Bearer" })) as unknown as typeof fetch;

    await expect(exchangeGoogleCode("auth-code", "https://app.example/callback")).rejects.toThrow(/refresh_token/);
  });

  it("refreshes an access token from a refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: "new-at", expires_in: 3600, token_type: "Bearer" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const accessToken = await refreshGoogleAccessToken("rt");

    expect(accessToken).toBe("new-at");
    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt");
  });

  it("throws MailReauthRequiredError when the token endpoint reports invalid_grant", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("invalid_grant: Token has been expired or revoked.", { status: 400 })) as unknown as typeof fetch;

    await expect(refreshGoogleAccessToken("revoked-rt")).rejects.toThrow(MailReauthRequiredError);
  });

  it("fetches the connected account's email from userinfo", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ email: "user@gmail.com" })) as unknown as typeof fetch;
    await expect(getGoogleUserEmail("at")).resolves.toBe("user@gmail.com");
  });
});
