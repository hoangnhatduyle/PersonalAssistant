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
import type { PendingMutation } from "../mutations";
import type { ConversationAnswer } from "../conversation-core";
import { endConversation, resolveActiveConversation } from "../conversation-memory";

// Echoes back whatever conversationId it was called with (the real one
// resolveActiveConversation resolved against the test DB, since that
// function isn't itself an injectable VoiceTurnDeps) unless overridden —
// voice_sessions.conversation_id has a real FK to voice_conversations, so a
// fabricated id would fail the persistence step these tests exercise.
function fakeConversationTurn(overrides: Partial<ConversationAnswer> = {}) {
  return vi.fn().mockImplementation(async (_supabase: unknown, _userId: string, _transcript: string, conversationId: string) => ({
    kind: "answer" as const,
    message: "ok",
    conversationId,
    ...overrides,
  }));
}

function fakeMutationProposal(overrides: { confidence: number; mutation: PendingMutation; summary?: string }) {
  return vi.fn().mockImplementation(async (_supabase: unknown, _userId: string, _transcript: string, conversationId: string) => ({
    kind: "mutation_proposal" as const,
    summary: "ok",
    conversationId,
    ...overrides,
  }));
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
    const runConversationTurn = fakeConversationTurn({ message: "Here's what's coming up." });

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "what's due soon" }, { transcribe, runConversationTurn });

    expect(result.state).toBe("Responding");
    expect(result.executed).toBe(true);
    expect(result.message).toBe("Here's what's coming up.");
    expect(transcribe).not.toHaveBeenCalled();
    expect(runConversationTurn).toHaveBeenCalledWith(user.client, userId, "what's due soon", expect.any(String));

    const row = await sessionRow(result.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();
    expect(row.ended_at).not.toBeNull();
    // Diagnostics columns (0022_voice_session_diagnostics.sql) stay null
    // for a plain answer -- there's no numeric confidence to record the
    // way a mutation proposal has, and routing responsibility lives
    // entirely in conversation-core.ts's own tool-calling loop.
    expect(row.query_kind).toBeNull();
    expect(row.schedule_time_window).toBeNull();
    expect(row.resolved_intent).toBeNull();
    expect(row.confidence_score).toBeNull();
    // 2f: persisted so conversation history (loadConversationHistory) can
    // read this turn back on a later one.
    expect(row.conversation_id).not.toBeNull();
    expect(row.response_message).toBe("Here's what's coming up.");
  });

  // AC-2
  it("AC-2: a mutating intent persists pending_mutation, sets a 5-minute expires_at, and enters AwaitingConfirmation", async () => {
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Buy textbook" } };
    const runConversationTurn = fakeMutationProposal({ confidence: 0.98, summary: "create a task to buy textbook", mutation });
    const before = Date.now();

    const result = await intakeVoiceTurn(
      user.client,
      userId,
      { transcript: "remind me to buy my textbook" },
      { transcribe: vi.fn(), runConversationTurn },
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
    const mutation: PendingMutation = { targetType: "task", operation: "create", payload: { title: "Unclear" } };
    const runConversationTurn = fakeMutationProposal({ confidence: 0.4, summary: "unclear", mutation });

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "uh do the thing" }, { transcribe: vi.fn(), runConversationTurn });

    expect(result.state).toBe("Responding");
    expect(result.message).toMatch(/rephrase/i);

    const row = await sessionRow(result.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.pending_mutation).toBeNull();
  });

  // Silence/no-speech handling: a blank transcript must deterministically ask
  // the user to repeat themselves rather than reaching the model at all --
  // previously nothing stopped an empty transcript from being misclassified
  // as a real query (e.g. "upcoming_schedule") and reading back a full
  // answer instead.
  it("a blank transcript asks the user to repeat, without ever calling runConversationTurn", async () => {
    const runConversationTurn = vi.fn();

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "   " }, { transcribe: vi.fn(), runConversationTurn });

    expect(runConversationTurn).not.toHaveBeenCalled();
    expect(result.state).toBe("Responding");
    expect(result.needsFollowUp).toBe(true);
    expect(result.message).toBe("I didn't catch that — could you try again?");
    // Distinct from the low-confidence message above -- a listener must be
    // able to tell "nothing was heard" apart from "something unclear was heard".
    expect(result.message).not.toMatch(/rephrase/i);

    const row = await sessionRow(result.sessionId);
    expect(row.state).toBe("Responding");
    expect(row.resolved_intent).toBeNull();
    expect(row.confidence_score).toBeNull();
    // supabase/migrations/0022_voice_session_diagnostics.sql: a silent
    // capture is a deliberate short-circuit, not a failure -- error_message
    // stays null (distinct from the genuine-failure case below).
    expect(row.query_kind).toBeNull();
    expect(row.schedule_time_window).toBeNull();
    expect(row.error_message).toBeNull();
  });

  it("an all-whitespace transcript transcribed from audio also asks the user to repeat", async () => {
    const transcribe = vi.fn().mockResolvedValue("");
    const runConversationTurn = vi.fn();

    const result = await intakeVoiceTurn(user.client, userId, { audio: Buffer.from("silence"), mimetype: "audio/webm" }, { transcribe, runConversationTurn });

    expect(runConversationTurn).not.toHaveBeenCalled();
    expect(result.message).toBe("I didn't catch that — could you try again?");
  });

  // Previously a bare `catch {}` discarded the actual error entirely -- a
  // failed turn left resolved_intent/confidence_score both NULL with no way
  // to tell why from the DB (this is exactly what a real production incident
  // looked like when investigating a different report). Confirmed tradeoff
  // (2h merge): a runConversationTurn failure now reads identically to a
  // transcribe failure -- both take this same friendly-clarification path,
  // rather than a data-tool DB error surfacing as a distinct 500 the way it
  // used to when resolveIntent and runConversationTurn were separate calls.
  it("a runConversationTurn failure logs and persists the actual error, distinct from silence, without throwing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const runConversationTurn = vi.fn().mockRejectedValue(new Error("OpenAI request timed out"));

    const result = await intakeVoiceTurn(
      user.client,
      userId,
      { transcript: "what should I do this afternoon" },
      { transcribe: vi.fn(), runConversationTurn },
    );

    expect(result.state).toBe("Responding");
    expect(result.message).toBe("Sorry, I had trouble processing that — could you try again?");
    // Distinct wording from the silence-guard message above, and from the
    // low-confidence "could you rephrase" message.
    expect(result.message).not.toBe("I didn't catch that — could you try again?");
    expect(consoleErrorSpy).toHaveBeenCalledWith("intakeVoiceTurn: transcribe/runConversationTurn failed", expect.any(Error));

    const row = await sessionRow(result.sessionId);
    expect(row.resolved_intent).toBeNull();
    expect(row.confidence_score).toBeNull();
    expect(row.query_kind).toBeNull();
    expect(row.schedule_time_window).toBeNull();
    expect(row.error_message).toBe("OpenAI request timed out");

    consoleErrorSpy.mockRestore();
  });

  // AC-4, NC-VOICE-003
  it("AC-4/NC-VOICE-003: only the transcript persists — the raw audio buffer is never written to any column", async () => {
    const audio = Buffer.from("fake-pcm-audio-bytes");
    const transcribe = vi.fn().mockResolvedValue("what's on my plate today");
    const runConversationTurn = fakeConversationTurn();

    const result = await intakeVoiceTurn(user.client, userId, { audio, mimetype: "audio/webm" }, { transcribe, runConversationTurn });

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
    const runConversationTurn = fakeMutationProposal({ confidence: 0.98, summary: "create a task", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "add a task" }, { transcribe: vi.fn(), runConversationTurn });

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
    const runConversationTurn = fakeMutationProposal({ confidence: 0.99, summary: "create a task to read chapter 4", mutation });
    const intake = await intakeVoiceTurn(
      user.client,
      userId,
      { transcript: "remind me to read chapter 4" },
      { transcribe: vi.fn(), runConversationTurn },
    );
    expect(intake.state).toBe("AwaitingConfirmation");

    // confirmVoiceSession takes no transcribe/runConversationTurn deps at
    // all — it can only execute what was already persisted (looked up
    // fresh from the DB by sessionId), structurally guaranteeing this isn't
    // a re-parse of a fresh transcript, regardless of which request/client
    // calls it.
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
    const runConversationTurn = fakeMutationProposal({ confidence: 0.99, summary: "create a task", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "add a task" }, { transcribe: vi.fn(), runConversationTurn });

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
    const runConversationTurn = fakeMutationProposal({ confidence: 0.99, summary: "create a task", mutation });
    const intake = await intakeVoiceTurn(user.client, userId, { transcript: "add a task" }, { transcribe: vi.fn(), runConversationTurn });

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
    const runConversationTurn = fakeMutationProposal({ confidence: 0.99, summary: "Delete the course.", mutation });

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "delete this course" }, { transcribe: vi.fn(), runConversationTurn });

    expect(result.state).toBe("AwaitingConfirmation");
    expect(result.message).toMatch(/2 deadlines/);
    expect(result.message).toMatch(/2 reminders/);
  });

  // NC-VOICE-001
  it("NC-VOICE-001: confirming a session that never reached AwaitingConfirmation is rejected, executing nothing", async () => {
    const { data: idleSession } = await admin.from("voice_sessions").insert({ user_id: userId }).select("id").single();

    await expect(confirmVoiceSession(user.client, userId, idleSession!.id)).rejects.toBeInstanceOf(VoiceSessionInvalidStateError);
  });

  // 2f/2h: the classify-then-route knowledge_lookup/general_conversation/
  // personalization_suggestions/upcoming_schedule dispatch chain is gone,
  // and (2h) so is the separate resolveIntent classifier -- every voice turn
  // hands off to ONE merged tool-calling conversational core
  // (src/lib/voice/conversation-core.ts), injected here exactly the way
  // transcribe already is.
  describe("conversational core (runConversationTurn)", () => {
    it("resolves the active conversation, calls runConversationTurn with the transcript, and returns citations/extractionLabel unconditionally", async () => {
      const runConversationTurn = fakeConversationTurn({
        message: "Financial aid applications are due March 2nd.",
        citations: [{ sourceId: "11111111-1111-4111-8111-111111111111", title: "UC Financial Aid Page", originUrl: "https://example.edu/aid" }],
        extractionLabel: "machine_extracted",
      });

      const result = await intakeVoiceTurn(
        user.client,
        userId,
        { transcript: "when is financial aid due" },
        { transcribe: vi.fn(), runConversationTurn },
      );

      expect(result.state).toBe("Responding");
      expect(result.executed).toBe(true);
      expect(result.message).toBe("Financial aid applications are due March 2nd.");
      expect(result.citations).toEqual([
        { sourceId: "11111111-1111-4111-8111-111111111111", title: "UC Financial Aid Page", originUrl: "https://example.edu/aid" },
      ]);
      expect(result.extractionLabel).toBe("machine_extracted");
      expect(runConversationTurn).toHaveBeenCalledWith(user.client, userId, "when is financial aid due", expect.any(String));

      const row = await sessionRow(result.sessionId);
      expect(row.state).toBe("Responding");
      expect(row.pending_mutation).toBeNull();
      expect(row.response_message).toBe("Financial aid applications are due March 2nd.");
    });

    it("sets queryKind personalization_suggestions only when the turn actually used that tool", async () => {
      const runConversationTurn = fakeConversationTurn({ message: "You have 2 suggestions.", usedPersonalizationSuggestions: true });

      const result = await intakeVoiceTurn(user.client, userId, { transcript: "check my suggestions" }, { transcribe: vi.fn(), runConversationTurn });

      expect(result.queryKind).toBe("personalization_suggestions");
    });

    it("leaves queryKind unset when the turn never used the personalization_suggestions tool", async () => {
      const runConversationTurn = fakeConversationTurn({ message: "Sure thing." });

      const result = await intakeVoiceTurn(user.client, userId, { transcript: "just chatting" }, { transcribe: vi.fn(), runConversationTurn });

      expect(result.queryKind).toBeUndefined();
    });

    // The trickiest invariant from the conversation-memory design (2b/2e):
    // when start_new_conversation fires mid-turn, the *current* turn's own
    // voice_sessions row must be filed under the NEW conversation id, not
    // the one intakeVoiceTurn started with -- otherwise this very turn
    // would corrupt the next turn's history lookup by hanging off an
    // already-closed conversation.
    it("persists the NEW conversation id when the core swaps it mid-turn, not the one the turn started with", async () => {
      const { conversationId: freshId } = await resolveActiveConversation(user.client, userId);
      // Close it immediately so runConversationTurn's fake can "open" a
      // distinct new one, mirroring what start_new_conversation really does.
      await endConversation(user.client, userId, freshId, "explicit");
      const { conversationId: swappedInId } = await resolveActiveConversation(user.client, userId);
      const runConversationTurn = vi.fn().mockResolvedValue({ kind: "answer", message: "Okay, starting fresh.", conversationId: swappedInId });

      const result = await intakeVoiceTurn(
        user.client,
        userId,
        { transcript: "never mind, start over" },
        { transcribe: vi.fn(), runConversationTurn },
      );

      expect(result.state).toBe("Responding");
      const row = await sessionRow(result.sessionId);
      expect(row.conversation_id).toBe(swappedInId);
      expect(row.conversation_id).not.toBe(freshId);
    });

    // Confirmed tradeoff (2h merge): a data-tool failure inside the merged
    // call (e.g. get_schedule's own DB error) is indistinguishable from a
    // plain model hiccup now -- both take the friendly-clarification path
    // rather than the old execution_failed-then-rethrow-as-500 behavior,
    // matching this stage's own state-machine semantics (still Transcribing
    // until an outcome is decided). The real error is still logged
    // server-side (see the "logs and persists the actual error" test above).
    it("a runConversationTurn failure lands the session in Responding via the friendly clarification path, without throwing", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const runConversationTurn = vi.fn().mockRejectedValue(new Error("model call failed"));

      const result = await intakeVoiceTurn(user.client, userId, { transcript: "look something up" }, { transcribe: vi.fn(), runConversationTurn });

      expect(result.state).toBe("Responding");
      expect(result.message).toBe("Sorry, I had trouble processing that — could you try again?");

      const row = await sessionRow(result.sessionId);
      expect(row.state).toBe("Responding");
      expect(row.error_message).toBe("model call failed");

      consoleErrorSpy.mockRestore();
    });
  });
});
