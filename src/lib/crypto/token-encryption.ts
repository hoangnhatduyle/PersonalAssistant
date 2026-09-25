import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function getKey(): Buffer {
  const key = Buffer.from(requireEnv("TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (got ${key.length})`);
  }
  return key;
}

/** Encrypts an OAuth refresh token before it's stored in mail_accounts (see 0047_mail_accounts.sql). */
export function encryptToken(plaintext: string): EncryptedToken {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws if the key is wrong or the ciphertext/authTag was tampered with (GCM auth failure). */
export function decryptToken(encrypted: EncryptedToken): string {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
