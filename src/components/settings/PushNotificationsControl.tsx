"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { usePushSubscription, type PushStatus } from "@/hooks/usePushSubscription";

const UNAVAILABLE_COPY: Partial<Record<PushStatus, string>> = {
  "not-installed": "On iPhone, notifications only work from the installed app. Tap Share, then Add to Home Screen, and open Cadence from there.",
  unsupported: "This browser doesn't support push notifications.",
  unconfigured: "Push notifications aren't set up on this deployment yet (missing VAPID public key).",
  denied: "Notifications are blocked for Cadence. Turn them on in your device's Settings, under Notifications, then come back.",
};

/** The push half of the Reminder notifications card: a per-device choice, since each browser or phone must grant its own permission. */
export function PushNotificationsControl() {
  const { status, busy, enable, disable, sendTest } = usePushSubscription();
  const { showToast } = useToast();

  const handleChange = async (checked: boolean) => {
    try {
      if (checked) await enable();
      else await disable();
    } catch {
      showToast("Could not change notifications for this device", "error");
    }
  };

  const handleTest = async () => {
    try {
      const result = await sendTest();
      if (result.delivered > 0) showToast("Test notification sent", "success");
      else showToast(result.failureReason ? `Couldn't send: ${result.failureReason}` : "No working device is registered", "error");
    } catch {
      showToast("Could not send a test notification", "error");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {status === "loading" ? (
        <Skeleton className="h-5 w-32" />
      ) : status === "on" || status === "off" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox label="Push notification on this device" aria-label="Push notifications enabled on this device" checked={status === "on"} onChange={(event) => handleChange(event.target.checked)} disabled={busy} />
          {status === "on" ? (
            <Button size="sm" variant="secondary" onClick={handleTest} disabled={busy}>
              Send test notification
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{UNAVAILABLE_COPY[status]}</p>
      )}
    </div>
  );
}
