import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createCourse, createTask, type TestUser } from "./helpers";

// Traces: SPEC-DATA-006 AC-5, AC-6, NC-DATA-005, NC-DATA-006, NC-DATA-007.
describe("soft delete", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("NC-DATA-005: RLS has no DELETE policy on courses, so a real DELETE from the owner has no effect", async () => {
    const courseId = await createCourse(admin, userId, { name: "Undeletable" });
    // No DELETE policy exists for this table, so RLS makes zero rows visible
    // to the DELETE regardless of ownership; Postgres reports this as
    // success-with-zero-rows, not an error, so the row surviving is the
    // actual assertion here.
    await user.client.from("courses").delete().eq("id", courseId);

    const { data } = await admin.from("courses").select("id").eq("id", courseId);
    expect(data ?? []).toHaveLength(1);
  });

  it("AC-5: soft-deleting a course sets deleted_at instead of removing the row", async () => {
    const courseId = await createCourse(admin, userId);

    const { error: updateError } = await admin
      .from("courses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", courseId);
    expect(updateError).toBeNull();

    const { data, error } = await admin.from("courses").select("id, deleted_at").eq("id", courseId).single();
    expect(error).toBeNull();
    expect(data?.deleted_at).not.toBeNull();
  });

  it("AC-6/NC-DATA-007: the active_courses view excludes soft-deleted rows", async () => {
    const courseId = await createCourse(admin, userId, { name: "To be deleted" });
    await admin.from("courses").update({ deleted_at: new Date().toISOString() }).eq("id", courseId);

    const { data: viaView } = await admin.from("active_courses").select("id").eq("id", courseId);
    expect(viaView ?? []).toHaveLength(0);

    const { data: viaTable } = await admin.from("courses").select("id").eq("id", courseId);
    expect(viaTable ?? []).toHaveLength(1);
  });

  it("AC-6/NC-DATA-007: the active_tasks view excludes soft-deleted rows", async () => {
    const taskId = await createTask(admin, userId, { title: "To be deleted" });
    await admin.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", taskId);

    const { data: viaView } = await admin.from("active_tasks").select("id").eq("id", taskId);
    expect(viaView ?? []).toHaveLength(0);
  });

  it("NC-DATA-006: hard-deleting a course sets linked_course_id to null on its notes", async () => {
    const courseId = await createCourse(admin, userId, { name: "Linked course" });
    const { data: note, error: noteError } = await admin
      .from("notes")
      .insert({ user_id: userId, body: "linked note", linked_course_id: courseId })
      .select("id")
      .single();
    expect(noteError).toBeNull();

    // Only ever exercised by a service-role hard delete in this backstop test;
    // application code must never issue this (NC-DATA-005).
    const { error: deleteError } = await admin.from("courses").delete().eq("id", courseId);
    expect(deleteError).toBeNull();

    const { data: refreshedNote } = await admin
      .from("notes")
      .select("linked_course_id")
      .eq("id", note!.id)
      .single();
    expect(refreshedNote?.linked_course_id).toBeNull();
  });
});
