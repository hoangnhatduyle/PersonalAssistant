import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMailAccount, upsertMailAccount } from "./accounts";
import { MailReauthRequiredError } from "./errors";
import { encryptToken } from "@/lib/crypto/token-encryption";

function fakeSupabase(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  } as never;
}

describe("getMailAccount", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("decrypts a stored refresh token", async () => {
    const encrypted = encryptToken("real-refresh-token");
    const supabase = fakeSupabase({
      provider: "google",
      provider_email: "user@gmail.com",
      refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv,
      refresh_token_auth_tag: encrypted.authTag,
    });

    const account = await getMailAccount(supabase, "user-1", "google");
    expect(account).toEqual({ provider: "google", providerEmail: "user@gmail.com", refreshToken: "real-refresh-token" });
  });

  it("returns null when no account row exists", async () => {
    const supabase = fakeSupabase(null);
    await expect(getMailAccount(supabase, "user-1", "google")).resolves.toBeNull();
  });

  // Regression: a rotated/wrong TOKEN_ENCRYPTION_KEY (or a corrupted row)
  // must degrade to the same "reconnect" path as a provider-revoked token,
  // not bubble up as an uncaught exception on every dashboard load.
  it("throws MailReauthRequiredError, not a raw decrypt error, when the row can't be decrypted", async () => {
    const encrypted = encryptToken("real-refresh-token");
    const supabase = fakeSupabase({
      provider: "google",
      provider_email: "user@gmail.com",
      refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv,
      refresh_token_auth_tag: encrypted.authTag,
    });

    // Simulate a key rotation between encrypt and decrypt.
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    await expect(getMailAccount(supabase, "user-1", "google")).rejects.toThrow(MailReauthRequiredError);
  });
});

describe("upsertMailAccount", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("encrypts the refresh token before writing", async () => {
    let written: Record<string, unknown> | undefined;
    const supabase = {
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          written = row;
          return { error: null };
        },
      }),
    } as never;

    await upsertMailAccount(supabase, "user-1", "google", "user@gmail.com", "plain-refresh-token");

    expect(written?.refresh_token_ciphertext).not.toBe("plain-refresh-token");
    expect(written?.provider_email).toBe("user@gmail.com");
  });
});
