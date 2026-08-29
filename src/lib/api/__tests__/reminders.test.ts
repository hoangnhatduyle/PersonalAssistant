import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createTask,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { syncReminderForTarget } from "../reminders";

// Traces: SPEC-CORE-005 AC-006/AC-008, SPEC-API-004 AC-1/AC-8. Also covers
// the Tracked-debt gap SPEC-API-004 AC-8's `given` clause drops: a Task's
// own due_at changing must resync its Reminder same as a Deadline's.
describe("syncReminderForTarget", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  async function liveReminder(targetType: "deadline" | "task", targetId: string) {
    const { data } = await admin
      .from("reminders")
      .select("*")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .in("acknowledgment_state", ["Scheduled", "Snoozed"])
      .maybeSingle();
    return data;
  }

  it("AC-006: creates a Scheduled reminder when none exists and reminders are enabled with a due date", async () => {
    const courseId = await createCourse(admin, userId);
    const deadlineId = await createDeadline(admin, userId, courseId, {
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
    });

    await syncReminderForTarget(user.client, {
      userId,
      targetType: "deadline",
      targetId: deadlineId,
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      remindersEnabled: true,
      reminderLeadMinutes: 60,
    });

    const reminder = await liveReminder("deadline", deadlineId);
    expect(reminder).not.toBeNull();
    expect(reminder?.acknowledgment_state).toBe("Scheduled");
  });

  it("AC-008: recomputes trigger_at on an existing live reminder rather than duplicating it", async () => {
    const taskId = await createTask(admin, userId, { due_at: new Date(Date.now() + 3_600_000).toISOString() });
    const firstDueAt = new Date(Date.now() + 3_600_000).toISOString();
    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: firstDueAt,
      remindersEnabled: true,
      reminderLeadMinutes: 30,
    });
    const before = await liveReminder("task", taskId);
    expect(before).not.toBeNull();

    // Tracked debt: a Task's due_at changing on its own (no reminders_enabled/
    // reminder_lead_minutes change) must still resync the reminder.
    const newDueAt = new Date(Date.now() + 7_200_000).toISOString();
    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: newDueAt,
      remindersEnabled: true,
      reminderLeadMinutes: 30,
    });

    const { data: allLive } = await admin
      .from("reminders")
      .select("*")
      .eq("target_type", "task")
      .eq("target_id", taskId)
      .in("acknowledgment_state", ["Scheduled", "Snoozed"]);
    expect(allLive ?? []).toHaveLength(1);
    expect(allLive?.[0].id).toBe(before?.id);
    expect(new Date(allLive![0].trigger_at).getTime()).toBe(new Date(newDueAt).getTime() - 30 * 60_000);
  });

  it("AC-008: dismisses the live reminder when reminders are disabled", async () => {
    const taskId = await createTask(admin, userId, { due_at: new Date(Date.now() + 3_600_000).toISOString() });
    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      remindersEnabled: true,
      reminderLeadMinutes: 60,
    });
    expect(await liveReminder("task", taskId)).not.toBeNull();

    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      remindersEnabled: false,
      reminderLeadMinutes: 60,
    });

    expect(await liveReminder("task", taskId)).toBeNull();
  });

  it("AC-008: dismisses the live reminder when a Task's due_at is cleared", async () => {
    const taskId = await createTask(admin, userId, { due_at: new Date(Date.now() + 3_600_000).toISOString() });
    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      remindersEnabled: true,
      reminderLeadMinutes: 60,
    });

    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: null,
      remindersEnabled: true,
      reminderLeadMinutes: 60,
    });

    expect(await liveReminder("task", taskId)).toBeNull();
  });

  it("AC-008: inserts a fresh Scheduled reminder rather than reviving an already-Delivered one", async () => {
    const taskId = await createTask(admin, userId, { due_at: new Date(Date.now() + 3_600_000).toISOString() });
    // guard_reminder_status forbids inserting directly into a non-initial
    // state, so create Scheduled first, then transition it (an allowed
    // Scheduled -> Delivered move) to simulate an already-fired reminder.
    const { data: inserted, error: insertError } = await admin
      .from("reminders")
      .insert({
        user_id: userId,
        target_type: "task",
        target_id: taskId,
        trigger_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { data: delivered, error: updateError } = await admin
      .from("reminders")
      .update({ acknowledgment_state: "Delivered", delivered_at: new Date().toISOString() })
      .eq("id", inserted!.id)
      .select("id")
      .single();
    expect(updateError).toBeNull();

    await syncReminderForTarget(user.client, {
      userId,
      targetType: "task",
      targetId: taskId,
      dueAt: new Date(Date.now() + 7_200_000).toISOString(),
      remindersEnabled: true,
      reminderLeadMinutes: 30,
    });

    const fresh = await liveReminder("task", taskId);
    expect(fresh).not.toBeNull();
    expect(fresh?.id).not.toBe(delivered!.id);

    const { data: stillDelivered } = await admin.from("reminders").select("acknowledgment_state").eq("id", delivered!.id).single();
    expect(stillDelivered?.acknowledgment_state).toBe("Delivered");
  });
});
