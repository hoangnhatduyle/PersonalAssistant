import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createSession,
  createTask,
  createVoiceSession,
  walkTransitions,
} from "./helpers";

// Traces: SPEC-DATA-006 AC-1, NC-DATA-002, NC-DATA-003.
describe("transition-guard trigger", () => {
  const admin = adminClient();
  let userId: string;
  let courseId: string;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    userId = user.userId;
    courseId = await createCourse(admin, userId);
  });

  describe("INSERT guard (initial-state check)", () => {
    it("rejects a deadline inserted with a non-initial status", async () => {
      const { error } = await admin.from("deadlines").insert({
        user_id: userId,
        course_id: courseId,
        title: "Bad insert",
        due_at: new Date().toISOString(),
        status: "Completed",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a task inserted with a non-initial status", async () => {
      const { error } = await admin.from("tasks").insert({
        user_id: userId,
        title: "Bad insert",
        status: "Done",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a reminder inserted with a non-initial acknowledgment_state", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);
      const { error } = await admin.from("reminders").insert({
        user_id: userId,
        target_type: "deadline",
        target_id: deadlineId,
        trigger_at: new Date().toISOString(),
        acknowledgment_state: "Delivered",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a voice_session inserted with a non-initial state", async () => {
      const { error } = await admin.from("voice_sessions").insert({
        user_id: userId,
        state: "Executing",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a session appointment inserted with a non-planned session_status", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);
      const { error } = await admin.from("appointments").insert({
        user_id: userId,
        title: "Bad session insert",
        date: new Date().toISOString().slice(0, 10),
        category: "Session",
        deadline_id: deadlineId,
        session_status: "done",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a non-session appointment inserted with a non-null session_status", async () => {
      const { error } = await admin.from("appointments").insert({
        user_id: userId,
        title: "Bad regular insert",
        date: new Date().toISOString().slice(0, 10),
        session_status: "planned",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("UPDATE guard (forbidden-transition check)", () => {
    it("[deadline_status] rejects Completed -> Not Started", async () => {
      const id = await createDeadline(admin, userId, courseId);
      await walkTransitions(admin, "deadlines", id, "status", [
        "In Progress",
        "Submitted",
        "Completed",
      ]);
      const { error } = await admin.from("deadlines").update({ status: "Not Started" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[deadline_status] rejects Cancelled -> In Progress", async () => {
      const id = await createDeadline(admin, userId, courseId);
      await walkTransitions(admin, "deadlines", id, "status", ["Cancelled"]);
      const { error } = await admin.from("deadlines").update({ status: "In Progress" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[deadline_status] rejects Overdue -> Not Started", async () => {
      const id = await createDeadline(admin, userId, courseId);
      await walkTransitions(admin, "deadlines", id, "status", ["Overdue"]);
      const { error } = await admin.from("deadlines").update({ status: "Not Started" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[task_status] rejects Done -> Open", async () => {
      const id = await createTask(admin, userId);
      await walkTransitions(admin, "tasks", id, "status", ["Done"]);
      const { error } = await admin.from("tasks").update({ status: "Open" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[task_status] rejects Cancelled -> Open", async () => {
      const id = await createTask(admin, userId);
      await walkTransitions(admin, "tasks", id, "status", ["Cancelled"]);
      const { error } = await admin.from("tasks").update({ status: "Open" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[reminder_status] rejects Acknowledged -> Scheduled", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);
      const id = await createReminder(admin, userId, "deadline", deadlineId);
      await walkTransitions(admin, "reminders", id, "acknowledgment_state", [
        "Delivered",
        "Acknowledged",
      ]);
      const { error } = await admin
        .from("reminders")
        .update({ acknowledgment_state: "Scheduled" })
        .eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[reminder_status] rejects Expired -> Delivered", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);
      const id = await createReminder(admin, userId, "deadline", deadlineId);
      await walkTransitions(admin, "reminders", id, "acknowledgment_state", [
        "Delivered",
        "Expired",
      ]);
      const { error } = await admin
        .from("reminders")
        .update({ acknowledgment_state: "Delivered" })
        .eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[voice_session_state] rejects Executing -> Idle", async () => {
      const id = await createVoiceSession(admin, userId);
      await walkTransitions(admin, "voice_sessions", id, "state", [
        "Listening",
        "Transcribing",
        "IntentResolved",
        "Executing",
      ]);
      const { error } = await admin.from("voice_sessions").update({ state: "Idle" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[voice_session_state] rejects Transcribing -> Executing", async () => {
      const id = await createVoiceSession(admin, userId);
      await walkTransitions(admin, "voice_sessions", id, "state", ["Listening", "Transcribing"]);
      const { error } = await admin.from("voice_sessions").update({ state: "Executing" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[voice_session_state] rejects Idle -> Executing", async () => {
      const id = await createVoiceSession(admin, userId);
      const { error } = await admin.from("voice_sessions").update({ state: "Executing" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[session_status] rejects done -> planned", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);
      const id = await createSession(admin, userId, deadlineId);
      await walkTransitions(admin, "appointments", id, "session_status", ["done"]);
      const { error } = await admin.from("appointments").update({ session_status: "planned" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[session_status] rejects skipped -> planned", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);
      const id = await createSession(admin, userId, deadlineId);
      await walkTransitions(admin, "appointments", id, "session_status", ["skipped"]);
      const { error } = await admin.from("appointments").update({ session_status: "planned" }).eq("id", id);
      expect(error).not.toBeNull();
    });

    it("[session_status] accepts the three legal edges: planned->done, planned->skipped, skipped->done", async () => {
      const deadlineId = await createDeadline(admin, userId, courseId);

      const doneId = await createSession(admin, userId, deadlineId);
      const { error: plannedToDoneError } = await admin.from("appointments").update({ session_status: "done" }).eq("id", doneId);
      expect(plannedToDoneError).toBeNull();

      const skippedId = await createSession(admin, userId, deadlineId);
      const { error: plannedToSkippedError } = await admin
        .from("appointments")
        .update({ session_status: "skipped" })
        .eq("id", skippedId);
      expect(plannedToSkippedError).toBeNull();

      const makeUpId = await createSession(admin, userId, deadlineId);
      await walkTransitions(admin, "appointments", makeUpId, "session_status", ["skipped", "done"]);
      const { data: makeUpSession } = await admin.from("appointments").select("session_status").eq("id", makeUpId).single();
      expect(makeUpSession?.session_status).toBe("done");
    });
  });
});

// Traces: supabase/migrations/0025_deadline_sessions.sql's
// guard_appointment_deadline_ownership — a bare FK only enforces referential
// existence, not same-owner.
describe("guard_appointment_deadline_ownership trigger", () => {
  const admin = adminClient();

  it("rejects a session whose deadline_id points at another user's deadline", async () => {
    const owner = await createAuthenticatedUser();
    const otherUser = await createAuthenticatedUser();
    const ownerCourseId = await createCourse(admin, owner.userId);
    const ownerDeadlineId = await createDeadline(admin, owner.userId, ownerCourseId);

    const { error } = await admin.from("appointments").insert({
      user_id: otherUser.userId,
      title: "Cross-owner session",
      date: new Date().toISOString().slice(0, 10),
      category: "Session",
      deadline_id: ownerDeadlineId,
      session_status: "planned",
    });
    expect(error).not.toBeNull();
  });
});

// Traces: supabase/migrations/0025_deadline_sessions.sql's
// advance_deadline_on_session_done — one step only, and every other current
// status is a no-op via the `where status = 'Not Started'` guard.
describe("advance_deadline_on_session_done trigger", () => {
  const admin = adminClient();
  let userId: string;
  let courseId: string;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    userId = user.userId;
    courseId = await createCourse(admin, userId);
  });

  it("completing a session on a Not Started deadline advances it to In Progress", async () => {
    const deadlineId = await createDeadline(admin, userId, courseId);
    const sessionId = await createSession(admin, userId, deadlineId);

    const { error } = await admin.from("appointments").update({ session_status: "done" }).eq("id", sessionId);
    expect(error).toBeNull();

    const { data: deadline } = await admin.from("deadlines").select("status").eq("id", deadlineId).single();
    expect(deadline?.status).toBe("In Progress");
  });

  it("completing a session on a Submitted deadline is a no-op, not an error", async () => {
    const deadlineId = await createDeadline(admin, userId, courseId);
    await walkTransitions(admin, "deadlines", deadlineId, "status", ["In Progress", "Submitted"]);
    const sessionId = await createSession(admin, userId, deadlineId);

    const { error } = await admin.from("appointments").update({ session_status: "done" }).eq("id", sessionId);
    expect(error).toBeNull();

    const { data: deadline } = await admin.from("deadlines").select("status").eq("id", deadlineId).single();
    expect(deadline?.status).toBe("Submitted");
  });
});
