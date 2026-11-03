"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmailRemindersControl } from "@/components/settings/EmailRemindersControl";
import { PushNotificationsControl } from "@/components/settings/PushNotificationsControl";

/**
 * One card for how a delivered reminder reaches you outside the app. Email is
 * an account setting; push is per device (each browser or phone has to grant
 * its own permission), so it is a second row here rather than a shared switch.
 */
export function ReminderNotificationsCard() {
  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <p className="font-display text-sm font-medium text-text-primary">Reminder notifications</p>
      <p className="text-xs text-text-secondary">
        When a reminder is delivered, also reach you by email and by a notification on this device, even when the app is closed.
      </p>
      <EmailRemindersControl />
      <PushNotificationsControl />
    </GlassPanel>
  );
}
