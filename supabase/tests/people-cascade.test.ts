import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createPerson,
  createReminder,
  createTask,
  type TestUser,
} from "./helpers";

// Traces: supabase/migrations/0013_people.sql soft_delete_person_cascade.
describe("soft_delete_person_cascade", () => {
  const admin = adminClient();
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
  });

  it("soft-deletes the person, their live courses/deadlines/tasks, dismisses reminders, unlinks notes, and returns accurate counts", async () => {
    const personId = await createPerson(admin, user.userId, { name: "Chau" });
    const courseId = await createCourse(admin, user.userId, { name: "Chau's course", person_id: personId });
    const deadlineId = await createDeadline(admin, user.userId, courseId, { person_id: personId });
    const taskId = await createTask(admin, user.userId, { title: "Chau's task", person_id: personId });
    const deadlineReminderId = await createReminder(admin, user.userId, "deadline", deadlineId);
    const taskReminderId = await createReminder(admin, user.userId, "task", taskId);

    const { data: note, error: noteError } = await admin
      .from("notes")
      .insert({ user_id: user.userId, body: "linked to Chau's course and task", linked_course_id: courseId, linked_task_id: taskId })
      .select("id")
      .single();
    expect(noteError).toBeNull();

    const { data, error } = await admin.rpc("soft_delete_person_cascade", { p_person_id: personId }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      courses_affected: 1,
      deadlines_affected: 1,
      tasks_affected: 1,
      reminders_dismissed: 2,
      notes_unlinked: 1,
    });

    const { data: person } = await admin.from("people").select("deleted_at").eq("id", personId).single();
    expect(person?.deleted_at).not.toBeNull();

    const { data: course } = await admin.from("courses").select("deleted_at").eq("id", courseId).single();
    expect(course?.deleted_at).not.toBeNull();

    const { data: deadline } = await admin.from("deadlines").select("deleted_at").eq("id", deadlineId).single();
    expect(deadline?.deleted_at).not.toBeNull();

    const { data: task } = await admin.from("tasks").select("deleted_at").eq("id", taskId).single();
    expect(task?.deleted_at).not.toBeNull();

    const { data: deadlineReminder } = await admin
      .from("reminders")
      .select("acknowledgment_state")
      .eq("id", deadlineReminderId)
      .single();
    expect(deadlineReminder?.acknowledgment_state).toBe("Dismissed");

    const { data: taskReminder } = await admin.from("reminders").select("acknowledgment_state").eq("id", taskReminderId).single();
    expect(taskReminder?.acknowledgment_state).toBe("Dismissed");

    const { data: refreshedNote } = await admin
      .from("notes")
      .select("linked_course_id, linked_task_id")
      .eq("id", note!.id)
      .single();
    expect(refreshedNote?.linked_course_id).toBeNull();
    expect(refreshedNote?.linked_task_id).toBeNull();
  });

  it("is a no-op returning all zeros against an already soft-deleted or unknown person", async () => {
    const { data, error } = await admin.rpc("soft_delete_person_cascade", { p_person_id: "00000000-0000-0000-0000-000000000000" }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ courses_affected: 0, deadlines_affected: 0, tasks_affected: 0, reminders_dismissed: 0, notes_unlinked: 0 });
  });

  it("leaves a person with no courses/tasks untouched beyond their own soft-delete", async () => {
    const personId = await createPerson(admin, user.userId, { name: "No data" });
    const { data, error } = await admin.rpc("soft_delete_person_cascade", { p_person_id: personId }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ courses_affected: 0, deadlines_affected: 0, tasks_affected: 0, reminders_dismissed: 0, notes_unlinked: 0 });
  });
});
