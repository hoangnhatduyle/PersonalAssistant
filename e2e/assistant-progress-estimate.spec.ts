import { expect, test } from "@playwright/test";
import { admin, createUserAndSignIn, openAssistant, runMutation, seedCourse } from "./fixtures";

// Real-LLM spec (no mocks), like every other assistant-*.spec.ts: each turn is a paid model call, so run it
// by hand, never from CI. It checks the model actually fills the new estimate/progress fields from natural
// speech and that nothing else changes. The deterministic side (schema, parsing, execution) is covered by the
// free unit tests in src/lib/voice/__tests__/.
test.describe("assistant: estimate and progress", () => {
  test("sets a deadline's progress and estimate without changing its status", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { data: row } = await admin
      .from("deadlines")
      .insert({ user_id: user.userId, course_id: courseId, title: "Term Paper", due_at: due, status: "Not Started" })
      .select("id")
      .single();
    await openAssistant(page);

    await runMutation(page, "My Term Paper is about 60 percent done, and the note is waiting on data");
    await runMutation(page, "Set the estimate for my Term Paper to 8 hours");

    const { data } = await admin.from("deadlines").select("status, estimated_hours, progress_percent, progress_note").eq("id", row!.id).single();
    expect(data?.progress_percent).toBe(60);
    expect(data?.progress_note?.toLowerCase()).toContain("data");
    expect(Number(data?.estimated_hours)).toBe(8);
    // Saying a percent is not a status change.
    expect(data?.status).toBe("Not Started");
  });

  test("sets a task's estimate", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const { data: row } = await admin.from("tasks").insert({ user_id: user.userId, title: "Write Intro", status: "Open" }).select("id").single();
    await openAssistant(page);

    await runMutation(page, "Set the estimate for my Write Intro task to half an hour");

    const { data } = await admin.from("tasks").select("estimated_hours").eq("id", row!.id).single();
    expect(Number(data?.estimated_hours)).toBe(0.5);
  });

  test("records a session's progress but does not reschedule it", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { data: deadline } = await admin
      .from("deadlines")
      .insert({ user_id: user.userId, course_id: courseId, title: "Term Paper", due_at: due, status: "Not Started" })
      .select("id")
      .single();
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const { data: session } = await admin
      .from("appointments")
      .insert({ user_id: user.userId, title: "Draft outline", date, time: "10:00", duration_minutes: 60, category: "Session", deadline_id: deadline!.id, session_status: "planned" })
      .select("id")
      .single();
    await openAssistant(page);

    await runMutation(page, "My Draft outline session is halfway done");

    const { data } = await admin.from("appointments").select("date, time, progress_percent, session_status").eq("id", session!.id).single();
    expect(data?.progress_percent).toBe(50);
    expect(data).toMatchObject({ date, time: "10:00", session_status: "planned" });
  });
});
