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
import { cascadeDeleteCourse, cascadeDeleteTask } from "../cascade";

// Traces: SPEC-API-004 AC-7/AC-12/AC-13, NC-API-008 (atomic cascade).
describe("cascadeDeleteCourse", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("soft-deletes the Course, cascades to live Deadlines, dismisses their live Reminders, and unlinks Notes", async () => {
    const courseId = await createCourse(admin, userId, { name: "Cascade course" });
    const deadlineId = await createDeadline(admin, userId, courseId);
    const otherDeadlineId = await createDeadline(admin, userId, courseId);
    await createReminder(admin, userId, "deadline", deadlineId);
    await createReminder(admin, userId, "deadline", otherDeadlineId);
    const { data: note } = await admin
      .from("notes")
      .insert({ user_id: userId, body: "linked note", linked_course_id: courseId })
      .select("id")
      .single();

    const result = await cascadeDeleteCourse(user.client, courseId);

    expect(result).toEqual({ deadlinesAffected: 2, remindersDismissed: 2, notesUnlinked: 1 });

    const { data: course } = await admin.from("courses").select("deleted_at").eq("id", courseId).single();
    expect(course?.deleted_at).not.toBeNull();

    const { data: deadlines } = await admin.from("deadlines").select("deleted_at").eq("course_id", courseId);
    expect((deadlines ?? []).every((d) => d.deleted_at !== null)).toBe(true);

    const { data: reminders } = await admin
      .from("reminders")
      .select("acknowledgment_state")
      .eq("target_type", "deadline")
      .in("target_id", [deadlineId, otherDeadlineId]);
    expect((reminders ?? []).every((r) => r.acknowledgment_state === "Dismissed")).toBe(true);

    const { data: refreshedNote } = await admin.from("notes").select("linked_course_id").eq("id", note!.id).single();
    expect(refreshedNote?.linked_course_id).toBeNull();
  });

  it("does not affect another user's course (RLS scoping, NC-API-001 defense in depth)", async () => {
    const otherAdmin = adminClient();
    const { data: otherUser } = await otherAdmin.auth.admin.createUser({
      email: `test-other-${Date.now()}@example.com`,
      password: "Pw-other-1234",
      email_confirm: true,
    });
    const otherCourseId = await createCourse(admin, otherUser!.user!.id, { name: "Not yours" });

    const result = await cascadeDeleteCourse(user.client, otherCourseId);
    expect(result).toEqual({ deadlinesAffected: 0, remindersDismissed: 0, notesUnlinked: 0 });

    const { data: course } = await admin.from("courses").select("deleted_at").eq("id", otherCourseId).single();
    expect(course?.deleted_at).toBeNull();
  });
});

describe("cascadeDeleteTask", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("soft-deletes the Task and unlinks referencing Notes", async () => {
    const taskId = await createTask(admin, userId);
    const { data: note } = await admin
      .from("notes")
      .insert({ user_id: userId, body: "linked note", linked_task_id: taskId })
      .select("id")
      .single();

    const result = await cascadeDeleteTask(user.client, taskId);
    expect(result).toEqual({ notesUnlinked: 1 });

    const { data: task } = await admin.from("tasks").select("deleted_at").eq("id", taskId).single();
    expect(task?.deleted_at).not.toBeNull();

    const { data: refreshedNote } = await admin.from("notes").select("linked_task_id").eq("id", note!.id).single();
    expect(refreshedNote?.linked_task_id).toBeNull();
  });
});
