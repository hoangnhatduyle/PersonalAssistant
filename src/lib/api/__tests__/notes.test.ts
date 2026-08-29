import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createCourse, createTask, type TestUser } from "../../../../supabase/tests/helpers";
import { ownsNoteLinkTargets } from "../notes";

// Traces: SPEC-API-004 AC-4 — a Note may only link to a Course/Task the caller owns.
describe("ownsNoteLinkTargets", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("allows no links at all", async () => {
    expect(await ownsNoteLinkTargets(user.client, userId, undefined, undefined)).toBe(true);
  });

  it("allows links to the caller's own Course and Task", async () => {
    const courseId = await createCourse(admin, userId);
    const taskId = await createTask(admin, userId);
    expect(await ownsNoteLinkTargets(user.client, userId, courseId, taskId)).toBe(true);
  });

  it("rejects a Course owned by another user", async () => {
    const { data: otherUser } = await admin.auth.admin.createUser({
      email: `test-other-${Date.now()}@example.com`,
      password: "Pw-other-1234",
      email_confirm: true,
    });
    const otherCourseId = await createCourse(admin, otherUser!.user!.id);

    expect(await ownsNoteLinkTargets(user.client, userId, otherCourseId, undefined)).toBe(false);
  });

  it("rejects a nonexistent Task id", async () => {
    expect(await ownsNoteLinkTargets(user.client, userId, undefined, "00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });
});
