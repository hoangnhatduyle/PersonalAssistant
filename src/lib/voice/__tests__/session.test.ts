import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { confirmVoiceSession, declineVoiceSession, intakeVoiceTurn, VoiceSessionExpiredError, VoiceSessionInvalidStateError } from "../session";
import type { ResolvedIntent } from "../intent";
import type { PendingMutation } from "../mutations";

function fakeResolver(intent: ResolvedIntent) {
  return vi.fn().mockResolvedValue(intent);
}

describe("intakeVoiceTurn / confirmVoiceSession / declineVoiceSession", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  async function sessionRow(id: string) {
    const { data } = await admin.from("voice_sessions").select("*").eq("id", id).single();
    return data!;
  }

  // AC-1
  it("AC-1: a high-confidence read-only query executes immediately without confirmation", async () => {
    const transcribe = vi.fn();
    const resolveIntent = fakeResolver({
      confidence: 0.99,
      readOnly: true,
      summary: "your upcoming schedule",
      queryKind: "upcoming_schedule",
    });

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "what's due soon" }, { transcribe, resolveIntent });

    expect(result.state).toBe("Responding");
    expect(result.executed).toBe(true);
    expect(transcribe).not.toHaveBeenCalled();

    const row = await sessionRow(result.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();
    expect(row.ended_at).not.toBeNull();
  });

  // AC-2
  it("AC-2: a mutating intent persists pending_mutation, sets a 5-minute expires_at, and enters AwaitingConfirmation", async () => {
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Buy textbook" } };
    const resolveIntent = fakeResolver({ confidence: 0.98, readOnly: false, summary: "create a task to buy textbook", mutation });
    const before = Date.now();

    const result = await intakeVoiceTurn(
      user.client,
      userId,
      { transcript: "remind me to buy my textbook" },
      { transcribe: vi.fn(), resolveIntent },
    );

    expect(result.state).toBe("AwaitingConfirmation");

    const row = await sessionRow(result.sessionId);
    expect(row.state).toBe("AwaitingConfirmation");
    expect(row.pending_mutation).toEqual(mutation);
    expect(row.expires_at).not.toBeNull();
    const deltaMs = new Date(row.expires_at as string).getTime() - before;
    expect(deltaMs).toBeGreaterThan(4 * 60_000);
    expect(deltaMs).toBeLessThanOrEqual(5 * 60_000 + 5_000);
  });

  // AC-3
  it("AC-3: a low-confidence intent asks for clarification instead of guessing, and modifies nothing", async () => {
    const resolveIntent = fakeResolver({ confidence: 0.4, readOnly: false, summary: "unclear" });

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "uh do the thing" }, { transcribe: vi.fn(), resolveIntent });

    expect(result.state).toBe("Responding");
    expect(result.message).toMatch(/rephrase/i);

    const row = await sessionRow(result.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();
  });

  // AC-4, NC-VOICE-003
  it("AC-4/NC-VOICE-003: only the transcript persists — the raw audio buffer is never written to any column", async () => {
    const audio = Buffer.from("fake-pcm-audio-bytes");
    const transcribe = vi.fn().mockResolvedValue("what's on my plate today");
    const resolveIntent = fakeResolver({ confidence: 0.99, readOnly: true, summary: "schedule", queryKind: "upcoming_schedule" });

    const result = await intakeVoiceTurn(user.client, userId, { audio, mimetype: "audio/webm" }, { transcribe, resolveIntent });

    expect(transcribe).toHaveBeenCalledWith(audio, "audio/webm");
    const row = await sessionRow(result.sessionId);
    expect(row.transcript).toBe("what's on my plate today");
    // voice_sessions has no audio-bytes column at all (SPEC-DATA-007) — the
    // only representation of what was said is this transcript field.
    expect(Object.keys(row)).not.toContain("audio");
  });

  // AC-5
  it("AC-5: declining clears pending_mutation and executes nothing", async () => {
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Should never be created" } };
    const resolveIntent = fakeResolver({ confidence: 0.98, readOnly: false, summary: "create a task", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "add a task" }, { transcribe: vi.fn(), resolveIntent });

    const decline = await declineVoiceSession(user.client, userId, intake.sessionId);
    expect(decline.message).toMatch(/won't/i);

    const row = await sessionRow(intake.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();

    const { data: task } = await admin.from("tasks").select("id").eq("user_id", userId).eq("title", "Should never be created").maybeSingle();
    expect(task).toBeNull();
  });

  // AC-6
  it("AC-6: a separate later call confirms the originally persisted pending_mutation, not a freshly re-parsed one", async () => {
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Read chapter 4" } };
    const resolveIntent = fakeResolver({ confidence: 0.99, readOnly: false, summary: "create a task to read chapter 4", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "remind me to read chapter 4" }, { transcribe: vi.fn(), resolveIntent });
    expect(intake.state).toBe("AwaitingConfirmation");

    // confirmVoiceSession takes no transcribe/resolveIntent deps at all — it
    // can only execute what was already persisted (looked up fresh from the
    // DB by sessionId), structurally guaranteeing this isn't a re-parse of a
    // fresh transcript, regardless of which request/client calls it.
    const confirmed = await confirmVoiceSession(user.client, userId, intake.sessionId);
    expect(confirmed.executed).toBe(true);

    const { data: task } = await admin.from("tasks").select("title").eq("user_id", userId).eq("title", "Read chapter 4").maybeSingle();
    expect(task).not.toBeNull();

    const row = await sessionRow(intake.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();
  });

  // Security/code/architect-review finding: two concurrent confirms for the
  // same session used to both pass the pre-check and both execute the
  // mutation, since the state-changing UPDATE had no compare-and-swap
  // predicate. Exactly one of two truly concurrent confirms must win.
  it("concurrency: only one of two concurrent confirm calls for the same session executes the mutation", async () => {
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Race condition canary" } };
    const resolveIntent = fakeResolver({ confidence: 0.99, readOnly: false, summary: "create a task", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "add a task" }, { transcribe: vi.fn(), resolveIntent });

    const [first, second] = await Promise.allSettled([
      confirmVoiceSession(user.client, userId, intake.sessionId),
      confirmVoiceSession(user.client, userId, intake.sessionId),
    ]);

    const outcomes = [first, second];
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(VoiceSessionInvalidStateError);

    const { data: tasks } = await admin.from("tasks").select("id").eq("user_id", userId).eq("title", "Race condition canary");
    expect(tasks ?? []).toHaveLength(1);
  });

  // AC-7, NC-VOICE-005
  it("AC-7/NC-VOICE-005: rejects confirmation once expires_at has passed, and executes nothing", async () => {
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Should expire before confirm" } };
    const resolveIntent = fakeResolver({ confidence: 0.99, readOnly: false, summary: "create a task", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "add a task" }, { transcribe: vi.fn(), resolveIntent });

    await admin.from("voice_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", intake.sessionId);

    await expect(confirmVoiceSession(user.client, userId, intake.sessionId)).rejects.toBeInstanceOf(VoiceSessionExpiredError);

    const { data: task } = await admin
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("title", "Should expire before confirm")
      .maybeSingle();
    expect(task).toBeNull();

    const row = await sessionRow(intake.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();
  });

  // AC-8, NC-VOICE-006
  it("AC-8/NC-VOICE-006: a Course-delete intent's AwaitingConfirmation prompt discloses the cascade scope", async () => {
    const courseId = await createCourse(admin, userId, { name: "Cascade-disclosure course" });
    const deadlineId1 = await createDeadline(admin, userId, courseId);
    const deadlineId2 = await createDeadline(admin, userId, courseId);
    await createReminder(admin, userId, "deadline", deadlineId1);
    await createReminder(admin, userId, "deadline", deadlineId2);

    const mutation: PendingMutation = { targetType: "course", operation: "delete", targetId: courseId };
    const resolveIntent = fakeResolver({ confidence: 0.99, readOnly: false, summary: "Delete the course.", mutation });

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "delete this course" }, { transcribe: vi.fn(), resolveIntent });

    expect(result.state).toBe("AwaitingConfirmation");
    expect(result.message).toMatch(/2 deadlines/);
    expect(result.message).toMatch(/2 reminders/);
  });

  // NC-VOICE-001
  it("NC-VOICE-001: confirming a session that never reached AwaitingConfirmation is rejected, executing nothing", async () => {
    const { data: idleSession } = await admin.from("voice_sessions").insert({ user_id: userId }).select("id").single();

    await expect(confirmVoiceSession(user.client, userId, idleSession!.id)).rejects.toBeInstanceOf(VoiceSessionInvalidStateError);
  });
});
