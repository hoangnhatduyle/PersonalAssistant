import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createTask,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { ownsFeedbackTarget } from "../feedback";

// Traces: SPEC-API-007 AC-11 — feedback.target_id must reference a
// target_type resource the caller owns.
describe("ownsFeedbackTarget", () => {
  const admin = adminClient();
  let user: TestUser;
  let userId: string;
  let deadlineId: string;
  let taskId: string;
  let reminderId: string;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
    const courseId = await createCourse(admin, userId);
    deadlineId = await createDeadline(admin, userId, courseId);
    taskId = await createTask(admin, userId);
    reminderId = await createReminder(admin, userId, "deadline", deadlineId);
  });

  it("allows a deadline the caller owns", async () => {
    expect(await ownsFeedbackTarget(user.client, userId, "deadline", deadlineId)).toBe(true);
  });

  it("allows a task the caller owns", async () => {
    expect(await ownsFeedbackTarget(user.client, userId, "task", taskId)).toBe(true);
  });

  it("allows a reminder the caller owns", async () => {
    expect(await ownsFeedbackTarget(user.client, userId, "reminder", reminderId)).toBe(true);
  });

  it("rejects a deadline owned by another user", async () => {
    const other = await createAuthenticatedUser();
    const otherCourseId = await createCourse(admin, other.userId);
    const otherDeadlineId = await createDeadline(admin, other.userId, otherCourseId);
    expect(await ownsFeedbackTarget(user.client, userId, "deadline", otherDeadlineId)).toBe(false);
  });

  it("rejects a nonexistent target id", async () => {
    expect(await ownsFeedbackTarget(user.client, userId, "task", "00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });
});
