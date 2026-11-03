"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/http/client";
import { useIsStandalone } from "@/hooks/useIsStandalone";
import {
  describePushSupport,
  detectPushEnvironment,
  getCurrentSubscription,
  getVapidPublicKey,
  urlBase64ToUint8Array,
  type PushSupport,
} from "@/lib/push/client";

export type PushStatus = "loading" | Exclude<PushSupport, "ok"> | "off" | "on";

export interface TestPushResult {
  delivered: number;
  removed: number;
  failureReason: string | null;
}

export interface UsePushSubscription {
  status: PushStatus;
  /** True while an enable / disable / test request is in flight. */
  busy: boolean;
  /** Must be called straight from a click handler: iOS only shows the permission prompt for a user gesture. */
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<TestPushResult>;
}

function subscriptionBody(subscription: PushSubscription) {
  return subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
}

/**
 * This browser's Web Push state for reminders, plus enable / disable / test.
 * The server row (push_subscriptions) is the opt-in; the browser subscription
 * is what receives. They can drift (a pruned row, a cleared browser), so on
 * load a browser that already holds a subscription re-registers it -- the
 * server upsert is idempotent -- instead of showing "on" for a row that no
 * longer exists.
 */
export function usePushSubscription(): UsePushSubscription {
  const isStandalone = useIsStandalone();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = describePushSupport(detectPushEnvironment(isStandalone));
      if (support !== "ok") {
        if (!cancelled) setStatus(support);
        return;
      }
      const subscription = await getCurrentSubscription().catch(() => null);
      if (cancelled) return;
      if (!subscription || Notification.permission !== "granted") {
        setStatus("off");
        return;
      }
      setStatus("on");
      await apiFetch("/api/push/subscribe", { method: "POST", body: subscriptionBody(subscription) }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [isStandalone]);

  const enable = useCallback(async () => {
    // First await in the handler, so the click's user activation is still live.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "off");
      return;
    }
    setBusy(true);
    try {
      const publicKey = getVapidPublicKey();
      if (!publicKey) {
        setStatus("unconfigured");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      try {
        await apiFetch("/api/push/subscribe", { method: "POST", body: subscriptionBody(subscription) });
      } catch (error) {
        // Do not leave a browser subscription the server refused (e.g. 409:
        // the device is registered to another account) -- it would look "on"
        // here while never receiving anything.
        await subscription.unsubscribe().catch(() => undefined);
        throw error;
      }
      setStatus("on");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const subscription = await getCurrentSubscription();
      if (subscription) {
        await apiFetch("/api/push/subscribe", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await apiFetch<TestPushResult>("/api/push/test", { method: "POST" });
      return data;
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, enable, disable, sendTest };
}
