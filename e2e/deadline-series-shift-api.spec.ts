import { expect, test } from "@playwright/test";
import { createCourse, createDeadline } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn } from "./fixtures";

// Traces: POST /api/deadlines/[id]/series-shift and supabase/migrations/0062_deadline_recurrence_anchor.sql.

const DAY_MS = 86_400_000;
const future = (days: number, hour: number) => {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

test.describe("POST /api/deadlines/[id]/series-shift", () => {
  test("moves the occurrence and its reminder, and rotates the schedule", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { reminders_enabled: true, reminder_lead_minutes: 60 });
    const slot = future(5, 17);
    const id = await createDeadline(admin, user.userId, courseId, { due_at: slot.toISOString(), recurrence_days: [slot.getUTCDay()] });
    const target = new Date(slot.getTime() + DAY_MS + 3 * 3_600_000);

    const response = await page.request.post(`/api/deadlines/${id}/series-shift`, { data: { due_at: target.toISOString() } });
    expect(response.ok()).toBe(true);
    expect((await response.json()).data.shifted).toEqual([{ id, due_at: target.toISOString(), course_id: courseId }]);

    const { data: row } = await admin.from("deadlines").select("due_at, recurrence_days").eq("id", id).single();
    expect(new Date(row!.due_at as string).toISOString()).toBe(target.toISOString());
    expect(row!.recurrence_days).toEqual([target.getUTCDay()]);

    const { data: reminder } = await admin.from("reminders").select("trigger_at").eq("target_id", id).in("acknowledgment_state", ["Scheduled", "Snoozed"]).maybeSingle();
    expect(reminder && new Date(reminder.trigger_at as string).toISOString()).toBe(new Date(target.getTime() - 60 * 60_000).toISOString());
  });

  test("rejects a one-off deadline, a bad body, and someone else's deadline", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId);
    const oneOff = await createDeadline(admin, user.userId, courseId, { due_at: future(5, 17).toISOString() });
    const body = { due_at: future(6, 9).toISOString() };

    expect((await page.request.post(`/api/deadlines/${oneOff}/series-shift`, { data: body })).status()).toBe(400);
    expect((await page.request.post(`/api/deadlines/${oneOff}/series-shift`, { data: { due_at: "tomorrow" } })).status()).toBe(400);

    const other = await admin.auth.admin.createUser({ email: `other-${Date.now()}@example.com`, password: "password-12345", email_confirm: true });
    await admin.from("profiles").upsert({ id: other.data.user!.id }).select();
    const otherCourse = await createCourse(admin, other.data.user!.id);
    const theirs = await createDeadline(admin, other.data.user!.id, otherCourse, { due_at: future(5, 17).toISOString(), recurrence_days: [1] });
    expect((await page.request.post(`/api/deadlines/${theirs}/series-shift`, { data: body })).status()).toBe(404);
    const { data: untouched } = await admin.from("deadlines").select("due_at").eq("id", theirs).single();
    expect(new Date(untouched!.due_at as string).toISOString()).toBe(future(5, 17).toISOString());
  });
});
