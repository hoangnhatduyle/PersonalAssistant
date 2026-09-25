import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./token-encryption";

describe("token-encryption", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips a plaintext refresh token through encrypt/decrypt", () => {
    const plaintext = "1//0gExampleRefreshTokenValue";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces a different iv/ciphertext on every call (no iv reuse)", () => {
    const a = encryptToken("same-plaintext");
    const b = encryptToken("same-plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("throws when the ciphertext has been tampered with", () => {
    const encrypted = encryptToken("a-refresh-token");
    const tampered = { ...encrypted, ciphertext: Buffer.from("tampered-bytes-here!").toString("base64") };
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const encrypted = encryptToken("a-refresh-token");
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("rejects a key that doesn't decode to 32 bytes", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });
});
