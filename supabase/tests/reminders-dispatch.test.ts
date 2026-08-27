import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  walkTransitions,
  type TestUser,
} from "./helpers";

// Traces: SPEC-DATA-006 AC-3, AC-7, AC-8, NC-DATA-008.
describe("reminder dispatch", () => {
  const admin = adminClient();
  let userId: string;
  let courseId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
    courseId = await createCourse(admin, userId);
  });

  it("AC-3: delivers a Scheduled reminder whose trigger_at is in the past", async () => {
    const deadlineId = await createDeadline(admin, userId, courseId);
    const id = await createReminder(admin, userId, "deadline", deadlineId, {
      trigger_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const { error: rpcError } = await admin.rpc("dispatch_due_reminders");
    expect(rpcError).toBeNull();

    const { data } = await admin
      .from("reminders")
      .select("acknowledgment_state, delivered_at")
      .eq("id", id)
      .single();
    expect(data?.acknowledgment_state).toBe("Delivered");
    expect(data?.delivered_at).not.toBeNull();
  });

  it("AC-3: delivers a Snoozed reminder whose snooze_until is in the past", async () => {
    const deadlineId = await createDeadline(admin, userId, courseId);
    const id = await createReminder(admin, userId, "deadline", deadlineId);
    await walkTransitions(admin, "reminders", id, "acknowledgment_state", ["Delivered", "Snoozed"]);
    await admin
      .from("reminders")
      .update({ snooze_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);

    const { error: rpcError } = await admin.rpc("dispatch_due_reminders");
    expect(rpcError).toBeNull();

    const { data } = await admin
      .from("reminders")
      .select("acknowledgment_state")
      .eq("id", id)
      .single();
    expect(data?.acknowledgment_state).toBe("Delivered");
  });

  it("AC-7: soft-deleting a reminder's target dismisses the reminder", async () => {
    const deadlineId = await createDeadline(admin, userId, courseId);
    const id = await createReminder(admin, userId, "deadline", deadlineId);

    await admin.from("deadlines").update({ deleted_at: new Date().toISOString() }).eq("id", deadlineId);

    const { data } = await admin
      .from("reminders")
      .select("acknowledgment_state")
      .eq("id", id)
      .single();
    expect(data?.acknowledgment_state).toBe("Dismissed");
  });

  it("NC-DATA-008: dispatch never delivers a reminder created against an already soft-deleted target", async () => {
    // Soft-delete the target first, then create the reminder — the AC-7
    // cascade trigger never fires for a reminder that didn't exist yet, so
    // this isolates the dispatch query's own independent filter.
    const deadlineId = await createDeadline(admin, userId, courseId);
    await admin.from("deadlines").update({ deleted_at: new Date().toISOString() }).eq("id", deadlineId);
    const id = await createReminder(admin, userId, "deadline", deadlineId, {
      trigger_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const { error: rpcError } = await admin.rpc("dispatch_due_reminders");
    expect(rpcError).toBeNull();

    const { data } = await admin
      .from("reminders")
      .select("acknowledgment_state")
      .eq("id", id)
      .single();
    expect(data?.acknowledgment_state).toBe("Scheduled");
  });

  it("AC-8: expires a Delivered reminder more than 60 minutes old", async () => {
    const deadlineId = await createDeadline(admin, userId, courseId);
    const id = await createReminder(admin, userId, "deadline", deadlineId);
    await walkTransitions(admin, "reminders", id, "acknowledgment_state", ["Delivered"]);
    await admin
      .from("reminders")
      .update({ delivered_at: new Date(Date.now() - 61 * 60_000).toISOString() })
      .eq("id", id);

    const { error: rpcError } = await admin.rpc("dispatch_due_reminders");
    expect(rpcError).toBeNull();

    const { data } = await admin
      .from("reminders")
      .select("acknowledgment_state")
      .eq("id", id)
      .single();
    expect(data?.acknowledgment_state).toBe("Expired");
  });

  it("denies dispatch_due_reminders to a non-service caller (EXECUTE revoked from authenticated)", async () => {
    const { error } = await user.client.rpc("dispatch_due_reminders");
    expect(error).not.toBeNull();
  });
});
