"use client";

import { useState } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { SnoozeUntilPicker } from "@/components/reminders/SnoozeUntilPicker";
import { FeedbackControl } from "@/components/feedback/FeedbackControl";
import { useAckReminder } from "@/hooks/useReminders";
import { useToast } from "@/components/ui/Toast";
import { REMINDER_STATUS_TONE } from "@/lib/status-colors";
import type { ReminderRow } from "@/lib/api/entity-types";

type Props = {
  reminder: ReminderRow;
  targetTitle: string;
};

/** All three actions only apply from Delivered (SPEC-API-004 AC-5). */
export function ReminderCard({ reminder, targetTitle }: Props) {
  const [isSnoozing, setIsSnoozing] = useState(false);
  const ack = useAckReminder(reminder.id);
  const { showToast } = useToast();

  const handleAck = async (event: "user_acknowledges" | "user_dismisses") => {
    try {
      await ack.mutateAsync({ event });
      showToast(event === "user_acknowledges" ? "Reminder acknowledged" : "Reminder dismissed", "success");
    } catch {
      showToast("Could not update reminder", "error");
    }
  };

  const handleSnooze = async (snoozeUntil: string) => {
    try {
      await ack.mutateAsync({ event: "user_snoozes", snooze_until: snoozeUntil });
      showToast("Reminder snoozed", "success");
      setIsSnoozing(false);
    } catch {
      showToast("Could not snooze reminder", "error");
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-medium text-text-primary">{targetTitle}</p>
          <p className="mt-0.5 font-mono text-xs text-text-secondary">Triggered {new Date(reminder.trigger_at).toLocaleString()}</p>
        </div>
        <StatusPill status={reminder.acknowledgment_state} tone={REMINDER_STATUS_TONE[reminder.acknowledgment_state]} />
      </div>

      {reminder.acknowledgment_state === "Delivered" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" isLoading={ack.isPending} onClick={() => handleAck("user_acknowledges")}>
            Acknowledge
          </Button>
          <Button size="sm" variant="secondary" isLoading={ack.isPending} onClick={() => handleAck("user_dismisses")}>
            Dismiss
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setIsSnoozing((value) => !value)}>
            Snooze
          </Button>
        </div>
      )}

      {isSnoozing && <SnoozeUntilPicker isSubmitting={ack.isPending} onConfirm={handleSnooze} onCancel={() => setIsSnoozing(false)} />}

      {reminder.acknowledgment_state === "Acknowledged" && (
        <FeedbackControl targetType="reminder" targetId={reminder.id} />
      )}
    </GlassPanel>
  );
}
