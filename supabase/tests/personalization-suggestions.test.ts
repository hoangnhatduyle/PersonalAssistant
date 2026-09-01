import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createCourse, createTask, type TestUser } from "./helpers";
import { randomUUID } from "node:crypto";

// Traces: supabase/migrations/0016_personalization_suggestions.sql.
describe("personalization_suggestions", () => {
  const admin = adminClient();
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    userA = await createAuthenticatedUser();
    userB = await createAuthenticatedUser();
  });

  function payload(scope: "course" | "task", targetId: string, overrides: Record<string, unknown> = {}) {
    return {
      user_id: userA.userId,
      scope,
      target_id: targetId,
      from_value: 60,
      to_value: 90,
      rationale: "Test rationale",
      source_feedback_ids: [randomUUID()],
      ...overrides,
    };
  }

  describe("ownership guard", () => {
    it("accepts a suggestion targeting a course the user owns", async () => {
      const courseId = await createCourse(admin, userA.userId);
      const { error } = await admin.from("personalization_suggestions").insert(payload("course", courseId));
      expect(error).toBeNull();
    });

    it("accepts a suggestion targeting a task the user owns", async () => {
      const taskId = await createTask(admin, userA.userId);
      const { error } = await admin.from("personalization_suggestions").insert(payload("task", taskId));
      expect(error).toBeNull();
    });

    it("rejects a suggestion whose target_id belongs to another user's course", async () => {
      const courseId = await createCourse(admin, userA.userId);
      const { error } = await admin
        .from("personalization_suggestions")
        .insert(payload("course", courseId, { user_id: userB.userId }));
      expect(error).not.toBeNull();
    });

    it("rejects a suggestion whose target_id references nothing at all", async () => {
      const { error } = await admin.from("personalization_suggestions").insert(payload("course", randomUUID()));
      expect(error).not.toBeNull();
    });
  });

  describe("status-transition guard", () => {
    it("rejects an insert with a non-pending status", async () => {
      const taskId = await createTask(admin, userA.userId);
      const { error } = await admin
        .from("personalization_suggestions")
        .insert(payload("task", taskId, { status: "applied" }));
      expect(error).not.toBeNull();
    });

    it("allows pending -> applied", async () => {
      const courseId = await createCourse(admin, userA.userId);
      const { data: row, error: insertError } = await admin
        .from("personalization_suggestions")
        .insert(payload("course", courseId))
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { error } = await admin
        .from("personalization_suggestions")
        .update({ status: "applied", applied_at: new Date().toISOString() })
        .eq("id", row!.id);
      expect(error).toBeNull();
    });

    it("allows pending -> dismissed", async () => {
      const taskId = await createTask(admin, userA.userId);
      const { data: row, error: insertError } = await admin
        .from("personalization_suggestions")
        .insert(payload("task", taskId))
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { error } = await admin
        .from("personalization_suggestions")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", row!.id);
      expect(error).toBeNull();
    });

    it("rejects applied -> dismissed", async () => {
      const courseId = await createCourse(admin, userA.userId);
      const { data: row, error: insertError } = await admin
        .from("personalization_suggestions")
        .insert(payload("course", courseId))
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { error: applyError } = await admin
        .from("personalization_suggestions")
        .update({ status: "applied", applied_at: new Date().toISOString() })
        .eq("id", row!.id);
      expect(applyError).toBeNull();

      const { error: dismissError } = await admin
        .from("personalization_suggestions")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", row!.id);
      expect(dismissError).not.toBeNull();
    });
  });

  describe("one pending suggestion per target", () => {
    it("rejects a second pending suggestion for the same (scope, target_id)", async () => {
      const courseId = await createCourse(admin, userA.userId);
      const { error: firstError } = await admin.from("personalization_suggestions").insert(payload("course", courseId));
      expect(firstError).toBeNull();

      const { error: secondError } = await admin.from("personalization_suggestions").insert(payload("course", courseId));
      expect(secondError).not.toBeNull();
    });

    it("allows a new pending suggestion once the prior one is no longer pending", async () => {
      const taskId = await createTask(admin, userA.userId);
      const { data: first, error: firstError } = await admin
        .from("personalization_suggestions")
        .insert(payload("task", taskId))
        .select("id")
        .single();
      expect(firstError).toBeNull();

      const { error: dismissError } = await admin
        .from("personalization_suggestions")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", first!.id);
      expect(dismissError).toBeNull();

      const { error: secondError } = await admin.from("personalization_suggestions").insert(payload("task", taskId));
      expect(secondError).toBeNull();
    });
  });

  describe("soft-delete cascade auto-dismiss", () => {
    it("dismisses a pending suggestion when its Course is soft-deleted", async () => {
      const courseId = await createCourse(admin, userA.userId, { name: "Cascade course" });
      const { data: suggestion, error: insertError } = await admin
        .from("personalization_suggestions")
        .insert(payload("course", courseId))
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { data, error } = await admin.rpc("soft_delete_course_cascade", { p_course_id: courseId }).single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ suggestions_dismissed: 1 });

      const { data: updated } = await admin
        .from("personalization_suggestions")
        .select("status, dismissed_at")
        .eq("id", suggestion!.id)
        .single();
      expect(updated?.status).toBe("dismissed");
      expect(updated?.dismissed_at).not.toBeNull();
    });

    it("dismisses a pending suggestion when its Task is soft-deleted", async () => {
      const taskId = await createTask(admin, userA.userId, { title: "Cascade task" });
      const { data: suggestion, error: insertError } = await admin
        .from("personalization_suggestions")
        .insert(payload("task", taskId))
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { data, error } = await admin.rpc("soft_delete_task_cascade", { p_task_id: taskId }).single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ suggestions_dismissed: 1 });

      const { data: updated } = await admin
        .from("personalization_suggestions")
        .select("status, dismissed_at")
        .eq("id", suggestion!.id)
        .single();
      expect(updated?.status).toBe("dismissed");
      expect(updated?.dismissed_at).not.toBeNull();
    });
  });
});
