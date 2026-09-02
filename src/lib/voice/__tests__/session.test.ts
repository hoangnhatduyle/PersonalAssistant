import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createTask,
  createTodoItem,
  createTodoList,
  walkTransitions,
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

  // Silence/no-speech handling: a blank transcript must deterministically ask
  // the user to repeat themselves rather than reaching the LLM classifier at
  // all -- previously nothing stopped an empty transcript from being
  // misclassified as a real query (e.g. "upcoming_schedule") and reading
  // back a full answer instead.
  it("a blank transcript asks the user to repeat, without ever calling resolveIntent", async () => {
    const resolveIntent = vi.fn();

    const result = await intakeVoiceTurn(user.client, userId, { transcript: "   " }, { transcribe: vi.fn(), resolveIntent });

    expect(resolveIntent).not.toHaveBeenCalled();
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
    const resolveIntent = vi.fn();

    const result = await intakeVoiceTurn(
      user.client,
      userId,
      { audio: Buffer.from("silence"), mimetype: "audio/webm" },
      { transcribe, resolveIntent },
    );

    expect(resolveIntent).not.toHaveBeenCalled();
    expect(result.message).toBe("I didn't catch that — could you try again?");
  });

  // Previously a bare `catch {}` discarded the actual error entirely -- a
  // failed turn left resolved_intent/confidence_score both NULL with no way
  // to tell why from the DB (this is exactly what a real production incident
  // looked like when investigating a different report).
  it("a resolveIntent failure logs and persists the actual error, distinct from silence", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolveIntent = vi.fn().mockRejectedValue(new Error("OpenAI request timed out"));

    const result = await intakeVoiceTurn(
      user.client,
      userId,
      { transcript: "what should I do this afternoon" },
      { transcribe: vi.fn(), resolveIntent },
    );

    expect(result.message).toBe("Sorry, I had trouble processing that — could you try again?");
    // Distinct wording from the silence-guard message above, and from the
    // low-confidence "could you rephrase" message.
    expect(result.message).not.toBe("I didn't catch that — could you try again?");
    expect(consoleErrorSpy).toHaveBeenCalledWith("intakeVoiceTurn: transcribe/resolveIntent failed", expect.any(Error));

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

  // SPEC-VOICE-005 AC-9, NC-VOICE-007: knowledge_lookup follows the same
  // read_only_query_resolved path as upcoming_schedule.
  describe("knowledge_lookup", () => {
    it("AC-9: executes immediately without confirmation and returns citation data", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.97,
        readOnly: true,
        summary: "look up financial aid deadlines",
        queryKind: "knowledge_lookup",
      });
      const knowledgeLookup = vi.fn().mockResolvedValue({
        message: "Financial aid applications are due March 2nd.",
        citations: [{ sourceId: "11111111-1111-4111-8111-111111111111", title: "UC Financial Aid Page", originUrl: "https://example.edu/aid" }],
      });

      const result = await intakeVoiceTurn(
        user.client,
        userId,
        { transcript: "when is financial aid due" },
        { transcribe: vi.fn(), resolveIntent, knowledgeLookup },
      );

      expect(result.state).toBe("Responding");
      expect(result.executed).toBe(true);
      expect(result.message).toBe("Financial aid applications are due March 2nd.");
      expect(result.citations).toEqual([
        { sourceId: "11111111-1111-4111-8111-111111111111", title: "UC Financial Aid Page", originUrl: "https://example.edu/aid" },
      ]);
      expect(result.extractionLabel).toBeUndefined();
      expect(knowledgeLookup).toHaveBeenCalledWith(user.client, userId, "when is financial aid due");

      const row = await sessionRow(result.sessionId);
      expect(row.state).toBe("Responding");
      expect(row.pending_mutation).toBeNull();
    });

    it("AC-6/AC-9 (SPEC-CORE-008 NC-023): surfaces the machine_extracted label when the lookup result carries one", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.97,
        readOnly: true,
        summary: "describe the screenshot I saved",
        queryKind: "knowledge_lookup",
      });
      const knowledgeLookup = vi.fn().mockResolvedValue({
        message: "The screenshot shows a syllabus with a final exam date of May 10th.",
        citations: [{ sourceId: "22222222-2222-4222-8222-222222222222", title: "Syllabus screenshot", originUrl: null }],
        extractionLabel: "machine_extracted",
      });

      const result = await intakeVoiceTurn(
        user.client,
        userId,
        { transcript: "what did that screenshot say" },
        { transcribe: vi.fn(), resolveIntent, knowledgeLookup },
      );

      expect(result.extractionLabel).toBe("machine_extracted");
    });

    it("AC-6: a no-relevant-knowledge lookup result is still returned as a completed execution, not treated as ambiguous", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.97,
        readOnly: true,
        summary: "look up something not in the knowledge base",
        queryKind: "knowledge_lookup",
      });
      const knowledgeLookup = vi.fn().mockResolvedValue({ message: "I don't have anything saved that answers that yet.", citations: [] });

      const result = await intakeVoiceTurn(
        user.client,
        userId,
        { transcript: "tell me something I never saved" },
        { transcribe: vi.fn(), resolveIntent, knowledgeLookup },
      );

      expect(result.executed).toBe(true);
      expect(result.citations).toEqual([]);
      expect(result.message).toBe("I don't have anything saved that answers that yet.");
    });

    it("a lookup failure lands the session in Responding via execution_failed rather than stranding it in Executing", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.97,
        readOnly: true,
        summary: "look something up",
        queryKind: "knowledge_lookup",
      });
      const knowledgeLookup = vi.fn().mockRejectedValue(new Error("embedding vendor call failed"));

      await expect(
        intakeVoiceTurn(user.client, userId, { transcript: "look something up" }, { transcribe: vi.fn(), resolveIntent, knowledgeLookup }),
      ).rejects.toThrow("embedding vendor call failed");
    });
  });

  describe("general_conversation", () => {
    it("executes immediately without confirmation and returns an uncited response", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.98,
        readOnly: true,
        summary: "weigh attending the meeting against resting",
        queryKind: "general_conversation",
      });
      const generalConversation = vi.fn().mockResolvedValue({
        message: "Protect the coffee conversation, then decide based on your energy and ask IEEE for notes if you skip.",
      });
      const transcript = "Should I rush from coffee to the IEEE meeting when I am tired?";

      const result = await intakeVoiceTurn(
        user.client,
        userId,
        { transcript },
        { transcribe: vi.fn(), resolveIntent, generalConversation },
      );

      expect(result.state).toBe("Responding");
      expect(result.executed).toBe(true);
      expect(result.message).toMatch(/ask IEEE for notes/i);
      expect(result.citations).toBeUndefined();
      expect(generalConversation).toHaveBeenCalledWith(user.client, userId, transcript);

      const row = await sessionRow(result.sessionId);
      expect(row.state).toBe("Responding");
      expect(row.pending_mutation).toBeNull();
    });

    it("lands the session in Responding via execution_failed when conversation generation fails", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.98,
        readOnly: true,
        summary: "give advice",
        queryKind: "general_conversation",
      });
      const transcript = "general conversation failure canary";
      const generalConversation = vi.fn().mockRejectedValue(new Error("conversation model call failed"));

      await expect(
        intakeVoiceTurn(
          user.client,
          userId,
          { transcript },
          { transcribe: vi.fn(), resolveIntent, generalConversation },
        ),
      ).rejects.toThrow("conversation model call failed");

      const { data: row } = await admin
        .from("voice_sessions")
        .select("state")
        .eq("user_id", userId)
        .eq("transcript", transcript)
        .single();
      expect(row?.state).toBe("Responding");
    });
  });

  // runUpcomingScheduleQuery: status filtering (a completed/done item must
  // never be read back as still due) and time-window scoping (a query
  // scoped to "today" must not pull in items due on other days).
  describe("upcoming_schedule", () => {
    it("excludes completed/done items and items outside the requested 'today' window, includes open Course To-Do items, and reads back as plain sentences", async () => {
      const courseId = await createCourse(admin, userId, { name: "Schedule scoping course" });
      const listId = await createTodoList(admin, userId, { name: "Project: Scoping canary" });

      const now = new Date();
      const todayNoonUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0)).toISOString();
      const tomorrowNoonUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0)).toISOString();
      const todayDateKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
      const tomorrowDate = new Date(now.getTime() + 86_400_000);
      const tomorrowDateKey = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getUTCDate()).padStart(2, "0")}`;

      await createDeadline(admin, userId, courseId, { title: "Open deadline due today", due_at: todayNoonUtc });

      const completedDeadlineId = await createDeadline(admin, userId, courseId, {
        title: "Completed deadline due today",
        due_at: todayNoonUtc,
      });
      await walkTransitions(admin, "deadlines", completedDeadlineId, "status", ["In Progress", "Submitted", "Completed"]);

      await createTask(admin, userId, { title: "Open task due today", due_at: todayNoonUtc });

      const doneTaskId = await createTask(admin, userId, { title: "Done task due today", due_at: todayNoonUtc });
      await walkTransitions(admin, "tasks", doneTaskId, "status", ["Done"]);

      await createDeadline(admin, userId, courseId, { title: "Deadline due tomorrow", due_at: tomorrowNoonUtc });

      // Previously invisible to this query entirely (only Deadlines/Tasks
      // were queried) -- a Course To-Do / custom-project item due today
      // must now show up just like a Deadline or Task would.
      await createTodoItem(admin, userId, listId, { title: "Open todo item due today", due_date: todayDateKey });
      const doneTodoItemId = await createTodoItem(admin, userId, listId, { title: "Done todo item due today", due_date: todayDateKey });
      await admin.from("todo_items").update({ is_done: true }).eq("id", doneTodoItemId);
      await createTodoItem(admin, userId, listId, { title: "Todo item due tomorrow", due_date: tomorrowDateKey });

      const resolveIntent = fakeResolver({
        confidence: 0.99,
        readOnly: true,
        summary: "what's due today",
        queryKind: "upcoming_schedule",
        scheduleTimeWindow: "today",
      });

      const result = await intakeVoiceTurn(user.client, userId, { transcript: "what is due today" }, { transcribe: vi.fn(), resolveIntent });

      expect(result.message).toContain("Open deadline due today");
      expect(result.message).toContain("Open task due today");
      expect(result.message).toContain("Open todo item due today");
      expect(result.message).not.toContain("Completed deadline due today");
      expect(result.message).not.toContain("Done task due today");
      expect(result.message).not.toContain("Done todo item due today");
      expect(result.message).not.toContain("Deadline due tomorrow");
      expect(result.message).not.toContain("Todo item due tomorrow");
      // Human-readable ("today at ..."), not a raw ISO timestamp.
      expect(result.message).toMatch(/today at \d{1,2}:\d{2} [AP]M/);
      expect(result.message).not.toMatch(/\d{4}-\d{2}-\d{2}T/);

      // Diagnostics (supabase/migrations/0022_voice_session_diagnostics.sql):
      // the resolved query_kind/schedule_time_window are now persisted so a
      // turn's actual routing is provable from the DB, not inferred.
      const row = await sessionRow(result.sessionId);
      expect(row.query_kind).toBe("upcoming_schedule");
      expect(row.schedule_time_window).toBe("today");
      expect(row.error_message).toBeNull();
    });

    it("falls back to the unscoped next-N behavior when no time window is resolved", async () => {
      const resolveIntent = fakeResolver({
        confidence: 0.99,
        readOnly: true,
        summary: "what's coming up",
        queryKind: "upcoming_schedule",
      });

      const result = await intakeVoiceTurn(user.client, userId, { transcript: "what's coming up" }, { transcribe: vi.fn(), resolveIntent });

      expect(result.state).toBe("Responding");
      expect(result.executed).toBe(true);
    });
  });
});
