import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface ReminderSyncInput {
  userId: string;
  targetType: "deadline" | "task" | "appointment";
  targetId: string;
  /** A Deadline's due_at is never null; a Task's may be null/cleared. */
  dueAt: string | null;
  /** For a Deadline this is its governing Course's setting, not its own. */
  remindersEnabled: boolean;
  reminderLeadMinutes: number;
}

/**
 * SPEC-CORE-005 AC-006/AC-008, SPEC-API-004 AC-1/AC-8: the single place that
 * creates, recomputes, or dismisses a Deadline's or Task's Reminder to match
 * its current due_at/reminders_enabled/reminder_lead_minutes. Called on both
 * entity create and update, for both target types — so the Task-due_at edit
 * branch (Tracked debt: SPEC-API-004 AC-8's `given` clause only spells out a
 * Deadline's due_at and Course/Task's reminder settings, dropping a Task's
 * own due_at changing) is never dropped again; SPEC-CORE-005 AC-008 already
 * requires it.
 *
 * A Delivered reminder is never updated in place (Delivered -> Scheduled is a
 * forbidden transition, reminders_one_live_per_target_idx only constrains
 * Scheduled/Snoozed): recompute after delivery inserts a fresh Scheduled row
 * instead, same as first creation — both cases are "no live reminder exists
 * for this target right now."
 */
export async function syncReminderForTarget(
  supabase: SupabaseClient<Database>,
  input: ReminderSyncInput,
): Promise<void> {
  const { data: live } = await supabase
    .from("reminders")
    .select("id")
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .in("acknowledgment_state", ["Scheduled", "Snoozed"])
    .maybeSingle();

  const shouldHaveReminder = input.remindersEnabled && input.dueAt !== null;

  if (!shouldHaveReminder) {
    if (live) {
      await supabase.from("reminders").update({ acknowledgment_state: "Dismissed" }).eq("id", live.id);
    }
    return;
  }

  const triggerAt = new Date(
    new Date(input.dueAt as string).getTime() - input.reminderLeadMinutes * 60_000,
  ).toISOString();

  if (live) {
    await supabase.from("reminders").update({ trigger_at: triggerAt }).eq("id", live.id);
  } else {
    await supabase.from("reminders").insert({
      user_id: input.userId,
      target_type: input.targetType,
      target_id: input.targetId,
      trigger_at: triggerAt,
    });
  }
}
