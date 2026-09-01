import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createCourse, createDeadline, createReminder, type TestUser } from "../../../../supabase/tests/helpers";
import { formatCascadeDisclosure, previewCourseDeleteCascade } from "../cascade-preview";

describe("previewCourseDeleteCascade / formatCascadeDisclosure", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("counts live deadlines and their live reminders", async () => {
    const courseId = await createCourse(admin, userId);
    const deadlineId1 = await createDeadline(admin, userId, courseId);
    const deadlineId2 = await createDeadline(admin, userId, courseId);
    await createReminder(admin, userId, "deadline", deadlineId1);
    await createReminder(admin, userId, "deadline", deadlineId2);

    const preview = await previewCourseDeleteCascade(user.client, userId, courseId);
    expect(preview).toEqual({ deadlinesAffected: 2, remindersLive: 2, notesAffected: 0, todoItemsAffected: 0 });
  });

  it("counts notes linked to a course with no live deadlines (architect-review finding: don't claim nothing is affected)", async () => {
    const courseId = await createCourse(admin, userId, { name: "No deadlines, has notes" });
    await admin.from("notes").insert({ user_id: userId, body: "linked", linked_course_id: courseId });

    const preview = await previewCourseDeleteCascade(user.client, userId, courseId);
    expect(preview).toEqual({ deadlinesAffected: 0, remindersLive: 0, notesAffected: 1, todoItemsAffected: 0 });

    const message = formatCascadeDisclosure(preview);
    expect(message).not.toMatch(/nothing else will be affected/i);
    expect(message).toMatch(/1 note/);
  });

  it("reports a fully-empty course accurately", async () => {
    const courseId = await createCourse(admin, userId, { name: "Truly empty" });
    const preview = await previewCourseDeleteCascade(user.client, userId, courseId);
    expect(preview).toEqual({ deadlinesAffected: 0, remindersLive: 0, notesAffected: 0, todoItemsAffected: 0 });
    expect(formatCascadeDisclosure(preview)).toMatch(/no deadlines, linked notes, or to-do items/i);
  });

  it("formats a combined disclosure for deadlines, reminders, notes, and to-do items together", () => {
    const message = formatCascadeDisclosure({ deadlinesAffected: 2, remindersLive: 1, notesAffected: 3, todoItemsAffected: 4 });
    expect(message).toMatch(/remove 2 deadlines/);
    expect(message).toMatch(/dismiss 1 reminder\b/);
    expect(message).toMatch(/unlink it from 3 notes/);
    expect(message).toMatch(/delete its to-do list \(4 items\)/);
  });
});
