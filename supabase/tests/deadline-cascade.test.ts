import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createSession,
  walkTransitions,
  type TestUser,
} from "./helpers";

// Traces: supabase/migrations/0025_deadline_sessions.sql soft_delete_deadline_cascade.
describe("soft_delete_deadline_cascade", () => {
  const admin = adminClient();
  let user: TestUser;
  let courseId: string;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    courseId = await createCourse(admin, user.userId);
  });

  it("soft-deletes the deadline and its live sessions, dismisses its reminder, and returns accurate counts", async () => {
    const deadlineId = await createDeadline(admin, user.userId, courseId);
    const plannedId = await createSession(admin, user.userId, deadlineId);
    const doneId = await createSession(admin, user.userId, deadlineId);
    await admin.from("appointments").update({ session_status: "done" }).eq("id", doneId);
    const skippedId = await createSession(admin, user.userId, deadlineId);
    await admin.from("appointments").update({ session_status: "skipped" }).eq("id", skippedId);
    const reminderId = await createReminder(admin, user.userId, "deadline", deadlineId);

    const { data, error } = await admin.rpc("soft_delete_deadline_cascade", { p_deadline_id: deadlineId }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ sessions_affected: 3, reminders_dismissed: 1 });

    const { data: deadline } = await admin.from("deadlines").select("deleted_at").eq("id", deadlineId).single();
    expect(deadline?.deleted_at).not.toBeNull();

    for (const sessionId of [plannedId, doneId, skippedId]) {
      const { data: session } = await admin.from("appointments").select("deleted_at").eq("id", sessionId).single();
      expect(session?.deleted_at).not.toBeNull();
    }

    const { data: reminder } = await admin.from("reminders").select("acknowledgment_state").eq("id", reminderId).single();
    expect(reminder?.acknowledgment_state).toBe("Dismissed");
  });

  it("is a no-op returning all zeros against an already soft-deleted or unknown deadline", async () => {
    const { data, error } = await admin
      .rpc("soft_delete_deadline_cascade", { p_deadline_id: "00000000-0000-0000-0000-000000000000" })
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ sessions_affected: 0, reminders_dismissed: 0 });

    const deadlineId = await createDeadline(admin, user.userId, courseId);
    await walkTransitions(admin, "deadlines", deadlineId, "deleted_at", [new Date().toISOString()]);
    const { data: repeat, error: repeatError } = await admin
      .rpc("soft_delete_deadline_cascade", { p_deadline_id: deadlineId })
      .single();
    expect(repeatError).toBeNull();
    expect(repeat).toMatchObject({ sessions_affected: 0, reminders_dismissed: 0 });
  });

  it("leaves a deadline with no sessions untouched beyond its own soft-delete", async () => {
    const deadlineId = await createDeadline(admin, user.userId, courseId);
    const { data, error } = await admin.rpc("soft_delete_deadline_cascade", { p_deadline_id: deadlineId }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ sessions_affected: 0, reminders_dismissed: 0 });
  });
});
