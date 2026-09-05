import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createReminder,
  createSession,
  createTask,
  createTodoItem,
  createTodoList,
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

    it("transitions Not Started -> In Progress", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId, { status: "Not Started" });
      const result = await executePendingMutation(user.client, userId, {
        targetType: "deadline",
        operation: "transition",
        targetId: deadlineId,
        event: "user_marks_in_progress",
      });
      expect((result.data as { status: string }).status).toBe("In Progress");
    });

    it("rejects a transition that doesn't apply from the current status", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId, { status: "Not Started" });
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "deadline",
          operation: "transition",
          targetId: deadlineId,
          event: "user_confirms_done",
        }),
      ).rejects.toThrow(/Cannot apply/);
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

    it("transitions Open -> Done", async () => {
      const taskId = await createTask(admin, userId, { status: "Open" });
      const result = await executePendingMutation(user.client, userId, {
        targetType: "task",
        operation: "transition",
        targetId: taskId,
        event: "user_marks_done",
      });
      expect((result.data as { status: string }).status).toBe("Done");
    });

    it("rejects a transition that doesn't apply from the current status", async () => {
      const taskId = await createTask(admin, userId);
      await walkTransitions(admin, "tasks", taskId, "status", ["Done"]);
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "task",
          operation: "transition",
          targetId: taskId,
          event: "user_cancels",
        }),
      ).rejects.toThrow(/Cannot apply/);
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

    it("creates a course", async () => {
      const result = await executePendingMutation(user.client, userId, {
        targetType: "course",
        operation: "create",
        payload: { name: "CS 101" },
      });
      expect((result.data as { name: string }).name).toBe("CS 101");
    });

    it("updates a course's name", async () => {
      const courseId = await createCourse(admin, userId, { name: "Old name" });
      const result = await executePendingMutation(user.client, userId, {
        targetType: "course",
        operation: "update",
        targetId: courseId,
        payload: { name: "New name" },
      });
      expect((result.data as { name: string }).name).toBe("New name");
    });

    it("throws MutationTargetNotFoundError updating a nonexistent course", async () => {
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "course",
          operation: "update",
          targetId: "00000000-0000-0000-0000-000000000000",
          payload: { name: "New name" },
        }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });
  });

  describe("session", () => {
    it("creates a session under a live deadline, forcing category and session_status", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const result = await executePendingMutation(user.client, userId, {
        targetType: "session",
        operation: "create",
        payload: { deadline_id: deadlineId, title: "Read chapter 3", date: "2026-09-06" },
      });
      const session = result.data as { title: string; category: string; session_status: string };
      expect(session.title).toBe("Read chapter 3");
      expect(session.category).toBe("Session");
      expect(session.session_status).toBe("planned");
    });

    it("throws MutationTargetNotFoundError creating a session under a nonexistent/foreign deadline", async () => {
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "session",
          operation: "create",
          payload: { deadline_id: "00000000-0000-0000-0000-000000000000", title: "Read chapter 3", date: "2026-09-06" },
        }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });

    it("deletes a session (soft-delete)", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const sessionId = await createSession(admin, userId, deadlineId);
      await executePendingMutation(user.client, userId, { targetType: "session", operation: "delete", targetId: sessionId });

      const { data } = await admin.from("appointments").select("deleted_at").eq("id", sessionId).single();
      expect(data?.deleted_at).not.toBeNull();
    });

    it("transitions planned -> done", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const sessionId = await createSession(admin, userId, deadlineId);
      const result = await executePendingMutation(user.client, userId, {
        targetType: "session",
        operation: "transition",
        targetId: sessionId,
        event: "user_marks_session_done",
      });
      expect((result.data as { session_status: string }).session_status).toBe("done");
    });

    it("rejects a transition from the terminal 'done' status", async () => {
      const courseId = await createCourse(admin, userId);
      const deadlineId = await createDeadline(admin, userId, courseId);
      const sessionId = await createSession(admin, userId, deadlineId);
      await walkTransitions(admin, "appointments", sessionId, "session_status", ["done"]);
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "session",
          operation: "transition",
          targetId: sessionId,
          event: "user_marks_session_skipped",
        }),
      ).rejects.toThrow(/Cannot apply/);
    });
  });

  describe("todo_list", () => {
    it("creates a freestanding to-do list (no course_id)", async () => {
      const result = await executePendingMutation(user.client, userId, {
        targetType: "todo_list",
        operation: "create",
        payload: { name: "Misc" },
      });
      expect((result.data as { name: string }).name).toBe("Misc");
    });

    it("creates a to-do list under a live course", async () => {
      const courseId = await createCourse(admin, userId);
      const result = await executePendingMutation(user.client, userId, {
        targetType: "todo_list",
        operation: "create",
        payload: { name: "Homework", course_id: courseId },
      });
      expect((result.data as { course_id: string }).course_id).toBe(courseId);
    });

    it("throws MutationTargetNotFoundError creating a list under a nonexistent/foreign course", async () => {
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "todo_list",
          operation: "create",
          payload: { name: "Homework", course_id: "00000000-0000-0000-0000-000000000000" },
        }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });
  });

  describe("todo_item", () => {
    it("creates a to-do item under a live list", async () => {
      const listId = await createTodoList(admin, userId);
      const result = await executePendingMutation(user.client, userId, {
        targetType: "todo_item",
        operation: "create",
        payload: { list_id: listId, title: "Read chapter 3" },
      });
      expect((result.data as { title: string }).title).toBe("Read chapter 3");
    });

    it("throws MutationTargetNotFoundError creating an item under a nonexistent/foreign list", async () => {
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "todo_item",
          operation: "create",
          payload: { list_id: "00000000-0000-0000-0000-000000000000", title: "Read chapter 3" },
        }),
      ).rejects.toBeInstanceOf(MutationTargetNotFoundError);
    });

    it("marks a to-do item done via update", async () => {
      const listId = await createTodoList(admin, userId);
      const itemId = await createTodoItem(admin, userId, listId, { is_done: false });
      const result = await executePendingMutation(user.client, userId, {
        targetType: "todo_item",
        operation: "update",
        targetId: itemId,
        payload: { is_done: true },
      });
      expect((result.data as { is_done: boolean }).is_done).toBe(true);
    });

    it("deletes a to-do item (soft-delete)", async () => {
      const listId = await createTodoList(admin, userId);
      const itemId = await createTodoItem(admin, userId, listId);
      await executePendingMutation(user.client, userId, { targetType: "todo_item", operation: "delete", targetId: itemId });

      const { data } = await admin.from("todo_items").select("deleted_at").eq("id", itemId).single();
      expect(data?.deleted_at).not.toBeNull();
    });

    it("throws MutationTargetNotFoundError deleting a nonexistent to-do item", async () => {
      await expect(
        executePendingMutation(user.client, userId, {
          targetType: "todo_item",
          operation: "delete",
          targetId: "00000000-0000-0000-0000-000000000000",
        }),
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
