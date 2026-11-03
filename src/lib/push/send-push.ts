import webpush from "web-push";
import { requireEnv } from "@/lib/env";

/** The columns of a push_subscriptions row that web-push needs. */
export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The JSON the service worker's `push` handler (public/sw.js) renders. */
export interface PushPayload {
  title: string;
  body: string;
  /** App-relative path opened when the notification is tapped. */
  url: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
}

export type PushSendResult =
  | { status: "sent" }
  /** The push service says this subscription no longer exists (404/410); the caller should delete it. */
  | { status: "gone" }
  /** Anything else -- network, 5xx, 429, bad VAPID config. Worth retrying on the next tick. */
  | { status: "failed"; reason: string };

/**
 * A reminder that fires an hour late is noise, and the reminder itself is
 * Expired by dispatch_due_reminders() after 60 minutes (0001_init.sql), so the
 * push service should drop an undeliverable message at the same point rather
 * than deliver it to a phone that comes online long afterwards.
 */
const PUSH_TTL_SECONDS = 60 * 60;

/**
 * Thin wrapper isolating the web-push call so it is mockable in unit tests
 * without touching the network (same shape as email/send-reminder-email.ts).
 *
 * Server-only. It reads the VAPID public key through requireEnv even though the
 * variable is NEXT_PUBLIC_-prefixed: that prefix exists so the browser bundle
 * can inline the same key for pushManager.subscribe (see usePushSubscription),
 * and a server-side dynamic lookup of it is fine.
 *
 * Failures are reported as a value, not thrown, because the caller must tell a
 * dead subscription (delete it) from a transient failure (retry the reminder).
 * The failure reason is the HTTP status or error message only: web-push errors
 * carry the endpoint URL and response body, which this must not write to logs.
 */
export async function sendPush(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<PushSendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: requireEnv("VAPID_SUBJECT"),
          publicKey: requireEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
          privateKey: requireEnv("VAPID_PRIVATE_KEY"),
        },
        TTL: PUSH_TTL_SECONDS,
        urgency: "high",
      },
    );
    return { status: "sent" };
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : null;
    if (statusCode === 404 || statusCode === 410) return { status: "gone" };
    return { status: "failed", reason: statusCode !== null ? `push service responded ${statusCode}` : error instanceof Error ? error.message : "unknown error" };
  }
}
