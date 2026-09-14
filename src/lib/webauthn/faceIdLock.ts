const CREDENTIAL_STORAGE_PREFIX = "cadence:faceid-credential:";

function storageKey(userId: string): string {
  return `${CREDENTIAL_STORAGE_PREFIX}${userId}`;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * This is a local device gate, not a remote credential: the credential id is
 * never sent to or checked by a server. A successful navigator.credentials
 * .get() is proof enough that the platform authenticator (Face ID/Touch ID)
 * accepted the enrolled biometric on this device -- the Supabase session
 * (cookie-based, see lib/supabase/server.ts) already proves identity to the
 * server, this only re-gates the local UI on top of that.
 */

export async function isFaceIdLockSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasFaceIdCredential(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(userId)) !== null;
  } catch {
    return false;
  }
}

export async function registerFaceIdCredential(userId: string, email: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Cadence" },
      user: {
        id: new TextEncoder().encode(userId),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Face ID setup was not completed.");
  }

  window.localStorage.setItem(storageKey(userId), bufferToBase64Url(credential.rawId));
}

export async function verifyFaceIdCredential(userId: string): Promise<boolean> {
  const storedId = window.localStorage.getItem(storageKey(userId));
  if (!storedId) return false;

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64UrlToBuffer(storedId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return assertion instanceof PublicKeyCredential;
  } catch {
    // User cancelled, wrong face, credential removed by the OS, etc. --
    // all treated the same: stay locked, let the person retry or fall
    // back to signing out.
    return false;
  }
}

export function clearFaceIdCredential(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Storage unavailable -- nothing to clean up.
  }
}
