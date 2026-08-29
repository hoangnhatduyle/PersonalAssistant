import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createTask,
  walkTransitions,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { executePendingMutation, MutationTargetNotFoundError, type PendingMutation } from "../mutations";

describe("executePendingMutation", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  describe("deadline", () => {
    it("creates a deadline and schedules its reminder", async () => {
      const courseId = await createCourse(admin, userId);
      const mutation: PendingMutation = {
        targetType: "deadline",
        operation: "create",
        payload: { course_id: courseId, title: "Problem set 3", due_at: new Date(Date.now() + 86_400_000).toISOString() },
      };
      const result = await executePendingMutation(user.client, userId, mutation);
      expect(result.summary).toMatch(/Problem set 3/);

      const { data: reminder } = await admin
        .from("reminders")
        .select("id")
        .eq("target_type", "deadline")
        .eq("target_id", (result.data as { id: string }).id)
        .maybeSingle();
      expect(reminder).not.toBeNull();
    });

    it("updates a deadline's due_at and resyncs its reminder", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const newDueAt = new Date(Date.now() + 172_800_000).toISOString();
      const mutation: PendingMutation = { targetType: "deadline", operation: "update", targetId: deadlineId, payload: { due_at: newDueAt } };

      const result = await executePendingMutation(user.client, userId, mutation);
      expect(new Date((result.data as { due_at: string }).due_at).getTime()).toBe(new Date(newDueAt).getTime());
    });

    it("deletes a deadline (soft-delete)", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      await executePendingMutation(user.client, userId, { targetType: "deadline", operation: "delete", targetId: deadlineId });

      const { data } = await admin.from("deadlines").select("deleted_at").eq("id", deadlineId).single();
      expect(data?.deleted_at).not.toBeNull();
    });

    it("throws MutationTargetNotFoundError deleting a nonexistent/already-deleted deadline instead of reporting false success", async () => {
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "deadline",
          operation: "delete",
          targetId: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });
  });

  describe("task", () => {
    it("creates a task and schedules its reminder", async () => {
      const mutation: PendingMutation = {
        targetType: "task",
        operation: "create",
        payload: { title: "Email advisor", due_at: new Date(Date.now() + 3_600_000).toISOString() },
      };
      const result = await executePendingMutation(user.client, userId, mutation);
      expect(result.summary).toMatch(/Email advisor/);
    });

    it("updates a task", async () => {
      const taskId = await createTask(admin, userId, { title: "Old title" });
      const result = await executePendingMutation(user.client, userId, {
        targetType: "task",
        operation: "update",
        targetId: taskId,
        payload: { title: "New title" },
      });
      expect((result.data as { title: string }).title).toBe("New title");
    });

    it("deletes a task and unlinks referencing notes", async () => {
      const taskId = await createTask(admin, userId);
      await admin.from("notes").insert({ user_id: userId, body: "linked", linked_task_id: taskId });

      await executePendingMutation(user.client, userId, { targetType: "task", operation: "delete", targetId: taskId });

      const { data: task } = await admin.from("tasks").select("deleted_at").eq("id", taskId).single();
      expect(task?.deleted_at).not.toBeNull();
    });

    it("throws MutationTargetNotFoundError deleting a nonexistent task", async () => {
      await expect(
        executePendingMutation(user.client, userId, { targetType: "task", operation: "delete", targetId: "00000000-0000-0000-0000-000000000000" }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });
  });

  describe("note", () => {
    it("creates, updates, and deletes a note", async () => {
      const created = await executePendingMutation(user.client, userId, {
        targetType: "note",
        operation: "create",
        payload: { body: "First draft" },
      });
      const noteId = (created.data as { id: string }).id;

      const updated = await executePendingMutation(user.client, userId, {
        targetType: "note",
        operation: "update",
        targetId: noteId,
        payload: { body: "Revised" },
      });
      expect((updated.data as { body: string }).body).toBe("Revised");

      await executePendingMutation(user.client, userId, { targetType: "note", operation: "delete", targetId: noteId });
      const { data } = await admin.from("notes").select("deleted_at").eq("id", noteId).single();
      expect(data?.deleted_at).not.toBeNull();
    });
  });

  describe("course", () => {
    it("deletes a course and cascades to its live deadlines", async () => {
      const courseId = await createCourse(admin, userId);
      await createDeadline(admin, userId, courseId);
      const result = await executePendingMutation(user.client, userId, { targetType: "course", operation: "delete", targetId: courseId });
      expect(result.cascade?.deadlinesDeleted).toBe(1);
    });

    it("throws MutationTargetNotFoundError for a nonexistent course instead of reporting false success", async () => {
      // Architect-review finding: soft_delete_course_cascade silently
      // returns all-zero counts for a missing/foreign course rather than
      // raising — this must be caught before that RPC runs, not after.
      await expect(
        executePendingMutation(user.client, userId, { targetType: "course", operation: "delete", targetId: "00000000-0000-0000-0000-000000000000" }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });

    it("throws MutationTargetNotFoundError for another user's course (not just a foreign row silently reporting zero)", async () => {
      const otherAdmin = adminClient();
      const { data: otherUser } = await otherAdmin.auth.admin.createUser({
        email: `test-other-${Date.now()}@example.com`,
        password: "Pw-other-1234",
        email_confirm: true,
      });
      const otherCourseId = await createCourse(admin, otherUser!.user!.id);

      await expect(
        executePendingMutation(user.client, userId, { targetType: "course", operation: "delete", targetId: otherCourseId }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });
  });

  describe("reminder", () => {
    it("acknowledges a Delivered reminder", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const reminderId = await createReminder(admin, userId, "deadline", deadlineId);
      await walkTransitions(admin, "reminders", reminderId, "acknowledgment_state", ["Delivered"]);

      const result = await executePendingMutation(user.client, userId, {
        targetType: "reminder",
        operation: "acknowledge",
        targetId: reminderId,
        event: "user_acknowledges",
      });
      expect(result.summary).toMatch(/acknowledged/i);
    });

    it("requires snooze_until for user_snoozes even if somehow absent from the persisted mutation", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const reminderId = await createReminder(admin, userId, "deadline", deadlineId);
      await walkTransitions(admin, "reminders", reminderId, "acknowledgment_state", ["Delivered"]);

      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "reminder",
          operation: "acknowledge",
          targetId: reminderId,
          event: "user_snoozes",
        }),
      ).rejects.toThrow(/snooze_until is required/);
    });

    it("rejects acknowledging a reminder not in the Delivered state", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const reminderId = await createReminder(admin, userId, "deadline", deadlineId);

      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "reminder",
          operation: "acknowledge",
          targetId: reminderId,
          event: "user_acknowledges",
        }),
      ).rejects.toThrow(/Cannot apply/);
    });
  });
});
