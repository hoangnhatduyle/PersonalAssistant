/**
 * Browser-side helpers for Web Push. No React here so the decision logic is
 * unit-testable; the stateful wrapper is src/hooks/usePushSubscription.ts.
 */
import { apiFetch } from "@/lib/http/client";

export type PushSupport =
  /** Everything needed to subscribe is present. */
  | "ok"
  /** iOS only delivers push to an installed home-screen app; in a Safari tab PushManager is absent. */
  | "not-installed"
  | "unsupported"
  /** NEXT_PUBLIC_VAPID_PUBLIC_KEY was not set at build time. */
  | "unconfigured"
  /** The user blocked notifications; only the OS/browser settings can undo that. */
  | "denied";

export interface PushEnvironment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  vapidPublicKey: string | null;
  permission: NotificationPermission | null;
}

/** Order matters: the most actionable explanation wins. */
export function describePushSupport(env: PushEnvironment): PushSupport {
  const apisPresent = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (!apisPresent) return env.isIOS && !env.isStandalone ? "not-installed" : "unsupported";
  if (!env.vapidPublicKey) return "unconfigured";
  if (env.permission === "denied") return "denied";
  return "ok";
}

/**
 * Next only inlines a *static* `process.env.NEXT_PUBLIC_X` member expression
 * into the client bundle, so this must stay a literal reference rather than a
 * lookup by name (see the warning on requireEnv in src/lib/env.ts). Read
 * lazily, not through publicEnv: that object throws on a missing value at
 * import time, which would break every page and test when push is not set up.
 */
export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

/** Decodes the URL-safe base64 VAPID public key into the bytes pushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function detectPushEnvironment(isStandalone: boolean): PushEnvironment {
  const hasNotification = typeof Notification !== "undefined";
  return {
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification,
    isIOS: typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent),
    isStandalone,
    vapidPublicKey: getVapidPublicKey(),
    permission: hasNotification ? Notification.permission : null,
  };
}

/** This browser's current push subscription, or null (no worker registered yet, or not subscribed). */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Detaches this device from reminder pushes before sign-out: the server row is
 * deleted while the session is still valid, then the browser subscription is
 * dropped. Best-effort by design -- it never throws and gives up after
 * `timeoutMs`, because failing to unsubscribe must not trap anyone signed in.
 * (If it does fail, the next account to subscribe on this device gets a 409
 * from POST /api/push/subscribe rather than inheriting these reminders.)
 */
export async function unsubscribeThisDevice(timeoutMs = 3000): Promise<void> {
  const work = async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const subscription = await getCurrentSubscription();
    if (!subscription) return;
    await apiFetch("/api/push/subscribe", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  };
  await Promise.race([work().catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}
