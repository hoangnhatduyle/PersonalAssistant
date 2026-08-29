import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createFeedback,
  createKnowledgeChunk,
  createKnowledgeSource,
  createReminder,
  createTask,
  createVoiceSession,
  type TestUser,
} from "./helpers";

// Traces: SPEC-DATA-006 AC-2, NC-DATA-001.
describe("Row Level Security", () => {
  const admin = adminClient();
  let userA: TestUser;
  let userB: TestUser;
  let courseAId: string;
  let deadlineAId: string;
  let taskAId: string;
  let noteAId: string;
  let reminderAId: string;
  let voiceSessionAId: string;
  let feedbackAId: string;
  let knowledgeSourceAId: string;
  let knowledgeChunkAId: string;

  beforeAll(async () => {
    userA = await createAuthenticatedUser();
    userB = await createAuthenticatedUser();

    courseAId = await createCourse(admin, userA.userId);
    deadlineAId = await createDeadline(admin, userA.userId, courseAId);
    taskAId = await createTask(admin, userA.userId);
    reminderAId = await createReminder(admin, userA.userId, "deadline", deadlineAId);
    voiceSessionAId = await createVoiceSession(admin, userA.userId);
    feedbackAId = await createFeedback(admin, userA.userId, "deadline", deadlineAId);

    const { data: note, error } = await admin
      .from("notes")
      .insert({ user_id: userA.userId, body: "A's note" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    noteAId = note.id as string;

    knowledgeSourceAId = await createKnowledgeSource(admin, userA.userId);
    knowledgeChunkAId = await createKnowledgeChunk(admin, knowledgeSourceAId, userA.userId);
  });

  it("hides user A's course from user B", async () => {
    const { data, error } = await userB.client.from("courses").select("id").eq("id", courseAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's deadline from user B", async () => {
    const { data, error } = await userB.client.from("deadlines").select("id").eq("id", deadlineAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's task from user B", async () => {
    const { data, error } = await userB.client.from("tasks").select("id").eq("id", taskAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's note from user B", async () => {
    const { data, error } = await userB.client.from("notes").select("id").eq("id", noteAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's reminder from user B", async () => {
    const { data, error } = await userB.client.from("reminders").select("id").eq("id", reminderAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's voice_session from user B", async () => {
    const { data, error } = await userB.client
      .from("voice_sessions")
      .select("id")
      .eq("id", voiceSessionAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's feedback from user B", async () => {
    const { data, error } = await userB.client.from("feedback").select("id").eq("id", feedbackAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's knowledge_source from user B", async () => {
    const { data, error } = await userB.client
      .from("knowledge_sources")
      .select("id")
      .eq("id", knowledgeSourceAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("hides user A's knowledge_chunk from user B", async () => {
    const { data, error } = await userB.client
      .from("knowledge_chunks")
      .select("id")
      .eq("id", knowledgeChunkAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("still lets user A see their own course", async () => {
    const { data } = await userA.client.from("courses").select("id").eq("id", courseAId);
    expect(data ?? []).toHaveLength(1);
  });

  it("rejects a reminder whose target_id belongs to another user's deadline", async () => {
    const { error } = await userB.client.from("reminders").insert({
      user_id: userB.userId,
      target_type: "deadline",
      target_id: deadlineAId,
      trigger_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });
});
