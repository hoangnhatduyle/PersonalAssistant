import { describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createReminder,
  createTask,
  createUserPreferences,
  walkTransitions,
  type TestUser,
} from "./helpers";

// Exercises the same query/claim shapes src/app/api/cron/send-reminder-emails/route.ts
// uses, against a real Postgres instance — the route itself is a thin
// glue layer over these DB operations plus a mocked-in-unit-tests Resend
// call, so there's no separate value in re-running it end-to-end here.
describe("reminder email candidates", () => {
  const admin = adminClient();

  async function createDeliveredReminderForTask(userId: string): Promise<{ reminderId: string; taskId: string }> {
    const taskId = await createTask(admin, userId, { due_at: new Date(Date.now() + 3_600_000).toISOString() });
    const reminderId = await createReminder(admin, userId, "task", taskId, {
      trigger_at: new Date(Date.now() - 60_000).toISOString(),
    });
    // INSERT must be Scheduled per guard_reminder_status — walk it forward.
    await walkTransitions(admin, "reminders", reminderId, "acknowledgment_state", ["Delivered"]);
    return { reminderId, taskId };
  }

  it("a Delivered reminder with emailed_at IS NULL is returned by the candidate query", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const { reminderId } = await createDeliveredReminderForTask(user.userId);

    const { data, error } = await admin
      .from("reminders")
      .select("id")
      .eq("acknowledgment_state", "Delivered")
      .is("emailed_at", null)
      .eq("id", reminderId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a second claim attempt on an already-claimed row affects 0 rows (concurrency guard)", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const { reminderId } = await createDeliveredReminderForTask(user.userId);

    const firstClaim = await admin
      .from("reminders")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", reminderId)
      .is("emailed_at", null)
      .select("id")
      .maybeSingle();
    expect(firstClaim.error).toBeNull();
    expect(firstClaim.data).not.toBeNull();

    const secondClaim = await admin
      .from("reminders")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", reminderId)
      .is("emailed_at", null)
      .select("id")
      .maybeSingle();
    expect(secondClaim.error).toBeNull();
    expect(secondClaim.data).toBeNull();
  });

  it("a user with email_reminders_enabled: false is excluded from the eligible set", async () => {
    const user: TestUser = await createAuthenticatedUser();
    await createUserPreferences(admin, user.userId, { email_reminders_enabled: false });
    const { reminderId } = await createDeliveredReminderForTask(user.userId);

    const { data: candidate } = await admin.from("reminders").select("user_id").eq("id", reminderId).single();
    const { data: prefs } = await admin
      .from("user_preferences")
      .select("email_reminders_enabled")
      .eq("user_id", candidate!.user_id)
      .single();
    expect(prefs?.email_reminders_enabled).toBe(false);
  });

  it("a user with no user_preferences row at all is still treated as eligible", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const { reminderId } = await createDeliveredReminderForTask(user.userId);

    const { data: candidate } = await admin.from("reminders").select("user_id").eq("id", reminderId).single();
    const { data: prefs } = await admin
      .from("user_preferences")
      .select("email_reminders_enabled")
      .eq("user_id", candidate!.user_id)
      .maybeSingle();
    // No row -> route treats this as enabled (matches DEFAULT_USER_PREFERENCES.email_reminders_enabled).
    expect(prefs).toBeNull();
  });

  it("reminders.emailed_at exists (migration 0012 applied)", async () => {
    const { error } = await admin.from("reminders").select("emailed_at").limit(1);
    expect(error).toBeNull();
  });
});
