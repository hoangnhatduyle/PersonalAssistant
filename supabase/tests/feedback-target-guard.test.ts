import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createTask,
  type TestUser,
} from "./helpers";
import { randomUUID } from "node:crypto";

// Traces: SPEC-DATA-010 AC-10, NC-DATA-013.
describe("feedback target ownership guard", () => {
  const admin = adminClient();
  let userA: TestUser;
  let userB: TestUser;
  let courseAId: string;
  let deadlineAId: string;
  let taskAId: string;
  let reminderAId: string;

  beforeAll(async () => {
    userA = await createAuthenticatedUser();
    userB = await createAuthenticatedUser();
    courseAId = await createCourse(admin, userA.userId);
    deadlineAId = await createDeadline(admin, userA.userId, courseAId);
    taskAId = await createTask(admin, userA.userId);
    reminderAId = await createReminder(admin, userA.userId, "deadline", deadlineAId);
  });

  it("AC-10: accepts feedback on a deadline the user owns", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userA.userId, target_type: "deadline", target_id: deadlineAId, rating: 5 });
    expect(error).toBeNull();
  });

  it("AC-10: accepts feedback on a task the user owns", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userA.userId, target_type: "task", target_id: taskAId, rating: 3 });
    expect(error).toBeNull();
  });

  it("AC-10: accepts feedback on a reminder the user owns", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userA.userId, target_type: "reminder", target_id: reminderAId, rating: 2 });
    expect(error).toBeNull();
  });

  it("NC-DATA-013: rejects feedback whose target_id belongs to another user's deadline", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userB.userId, target_type: "deadline", target_id: deadlineAId, rating: 4 });
    expect(error).not.toBeNull();
  });

  it("NC-DATA-013: rejects feedback whose target_id belongs to another user's task", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userB.userId, target_type: "task", target_id: taskAId, rating: 4 });
    expect(error).not.toBeNull();
  });

  it("NC-DATA-013: rejects feedback whose target_id belongs to another user's reminder", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userB.userId, target_type: "reminder", target_id: reminderAId, rating: 4 });
    expect(error).not.toBeNull();
  });

  it("NC-DATA-013: rejects feedback whose target_id references nothing at all", async () => {
    const { error } = await admin
      .from("feedback")
      .insert({ user_id: userA.userId, target_type: "deadline", target_id: randomUUID(), rating: 4 });
    expect(error).not.toBeNull();
  });

  it("NC-DATA-013: re-guards on an UPDATE that reassigns target_id, not just INSERT", async () => {
    const { data: row, error: insertError } = await admin
      .from("feedback")
      .insert({ user_id: userA.userId, target_type: "task", target_id: taskAId, rating: 3 })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { error: updateError } = await admin
      .from("feedback")
      .update({ target_id: randomUUID() })
      .eq("id", row!.id);
    expect(updateError).not.toBeNull();
  });
});
