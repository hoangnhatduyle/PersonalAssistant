import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createCourse, createDeadline, createSession, createTask, type TestUser } from "./helpers";

// Traces: supabase/migrations/0063_estimate_and_progress.sql. estimated_hours /
// progress_percent / progress_note on deadlines and tasks (appointments take the
// two progress columns). The CHECK constraints are the backstop behind the API's
// zod schemas.
describe("estimate and progress columns", () => {
  const admin = adminClient();
  let user: TestUser;
  let courseId: string;
  let deadlineId: string;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    courseId = await createCourse(admin, user.userId);
    deadlineId = await createDeadline(admin, user.userId, courseId);
  });

  it("stores and reads back an estimate, progress and note on a deadline and a task", async () => {
    const taskId = await createTask(admin, user.userId, { estimated_hours: 2.25, progress_percent: 0, progress_note: "not started" });
    const { data: task } = await admin.from("tasks").select("estimated_hours, progress_percent, progress_note").eq("id", taskId).single();
    expect(Number(task?.estimated_hours)).toBe(2.25);
    expect(task?.progress_percent).toBe(0); // 0 is stored as 0, not null
    expect(task?.progress_note).toBe("not started");

    const { error } = await admin.from("deadlines").update({ estimated_hours: 12, progress_percent: 80, progress_note: "final pass" }).eq("id", deadlineId);
    expect(error).toBeNull();
    const { data: deadline } = await admin.from("deadlines").select("estimated_hours, progress_percent, progress_note").eq("id", deadlineId).single();
    expect(Number(deadline?.estimated_hours)).toBe(12);
    expect(deadline?.progress_percent).toBe(80);
  });

  it("defaults every new column to null", async () => {
    const id = await createDeadline(admin, user.userId, courseId);
    const { data } = await admin.from("deadlines").select("estimated_hours, progress_percent, progress_note").eq("id", id).single();
    expect(data).toEqual({ estimated_hours: null, progress_percent: null, progress_note: null });
  });

  it.each([
    ["deadlines", "progress_percent", 101],
    ["deadlines", "progress_percent", -1],
    ["deadlines", "estimated_hours", 0],
    ["deadlines", "estimated_hours", -1],
    ["deadlines", "progress_note", "x".repeat(1001)],
    ["tasks", "progress_percent", 101],
    ["tasks", "estimated_hours", 0],
    ["tasks", "progress_note", "x".repeat(1001)],
  ])("rejects %s.%s = out-of-range value", async (table, column, value) => {
    const id = table === "tasks" ? await createTask(admin, user.userId) : await createDeadline(admin, user.userId, courseId);
    const { error } = await admin.from(table).update({ [column]: value }).eq("id", id);
    expect(error?.code).toBe("23514");
  });

  it("lets a session record progress and rejects an invalid value", async () => {
    const sessionId = await createSession(admin, user.userId, deadlineId);
    const ok = await admin.from("appointments").update({ progress_percent: 50, progress_note: "half" }).eq("id", sessionId);
    expect(ok.error).toBeNull();
    const bad = await admin.from("appointments").update({ progress_percent: 150 }).eq("id", sessionId);
    expect(bad.error?.code).toBe("23514");
  });

  it("exposes the new columns through the active_* views", async () => {
    const taskId = await createTask(admin, user.userId, { estimated_hours: 1, progress_percent: 10 });
    const { data } = await admin.from("active_tasks").select("estimated_hours, progress_percent").eq("id", taskId).single();
    expect(Number(data?.estimated_hours)).toBe(1);
    expect(data?.progress_percent).toBe(10);
    const { data: dl } = await admin.from("active_deadlines").select("progress_percent").eq("id", deadlineId).single();
    expect(dl).toHaveProperty("progress_percent");
  });

  it("counts a progress edit as a 'touch' (bumps tasks.updated_at)", async () => {
    const taskId = await createTask(admin, user.userId);
    const { data: before } = await admin.from("tasks").select("updated_at").eq("id", taskId).single();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await admin.from("tasks").update({ progress_percent: 30 }).eq("id", taskId);
    const { data: after } = await admin.from("tasks").select("updated_at").eq("id", taskId).single();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(before!.updated_at).getTime());
  });
});
