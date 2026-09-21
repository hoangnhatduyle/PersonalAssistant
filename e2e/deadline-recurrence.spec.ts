import { expect, test, type Page } from "@playwright/test";
import { admin, askAssistant, createUserAndSignIn, openAssistant, runMutation, seedCourse } from "./fixtures";

// Recurring deadlines (supabase/migrations/0041/0042): the form, the cancel
// scope dialog, and the voice/text assistant flows. Each occurrence is its own
// deadline row; series membership is recurrence_series_id.

const DAY_MS = 86_400_000;

async function seedRecurring(userId: string, courseId: string, title: string): Promise<{ id: string; seriesId: string }> {
  const due = new Date(Date.now() + 2 * DAY_MS);
  const { data, error } = await admin
    .from("deadlines")
    .insert({ user_id: userId, course_id: courseId, title, due_at: due.toISOString(), recurrence_days: [due.getUTCDay()] })
    .select("id, recurrence_series_id")
    .single();
  if (error) throw error;
  return { id: data.id, seriesId: data.recurrence_series_id as string };
}

async function seriesRows(seriesId: string) {
  const { data } = await admin.from("deadlines").select("id, status, due_at, recurrence_days, recurrence_end_date").eq("recurrence_series_id", seriesId).order("due_at");
  return data ?? [];
}

async function openDeadline(page: Page, id: string) {
  await page.goto(`/courses/deadlines/${id}`);
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
}

test.describe("recurring deadlines: UI", () => {
  test("the form creates a weekly recurring deadline with days and an end date", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "CS 101");
    await page.goto("/courses/deadlines");

    await page.getByRole("button", { name: "New deadline" }).click();
    await page.locator("#course_id").selectOption({ label: "CS 101" });
    await page.locator("#title").fill("Weekly quiz");
    await page.locator("#due_at").fill("2030-03-15T17:00"); // a Friday
    await page.getByLabel("Repeat weekly").check();
    await page.getByRole("button", { name: "Monday", exact: true }).click();
    await page.locator("#recurrence_end_date").fill("2030-06-01");
    await page.getByRole("button", { name: "Create deadline" }).click();

    await expect(page.getByText("Repeats every Monday and Friday until 2030-06-01")).toBeVisible();
    const { data } = await admin.from("deadlines").select("recurrence_days, recurrence_end_date, recurrence_series_id, id").eq("user_id", user.userId);
    expect(data).toHaveLength(1);
    expect(data![0].recurrence_days).toEqual([1, 5]);
    expect(data![0].recurrence_end_date).toBe("2030-06-01");
    expect(data![0].recurrence_series_id).toBe(data![0].id);
  });

  test("Cancel asks which scope; 'this occurrence' cancels it and the series carries on", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const { id, seriesId } = await seedRecurring(user.userId, courseId, "Weekly quiz");
    await openDeadline(page, id);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("This deadline repeats");
    await page.getByRole("button", { name: "Cancel this occurrence" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect.poll(async () => (await seriesRows(seriesId)).map((row) => row.status)).toEqual(["Cancelled", "Not Started"]);
  });

  test("'Cancel the whole series' cancels every open occurrence and creates no more", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const { id, seriesId } = await seedRecurring(user.userId, courseId, "Weekly quiz");
    await openDeadline(page, id);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Cancel the whole series" }).click();

    await expect.poll(async () => (await seriesRows(seriesId)).map((row) => row.status)).toEqual(["Cancelled"]);
  });

  test("a one-off deadline cancels immediately with no dialog", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const { data } = await admin
      .from("deadlines")
      .insert({ user_id: user.userId, course_id: courseId, title: "Essay", due_at: new Date(Date.now() + DAY_MS).toISOString() })
      .select("id")
      .single();
    await openDeadline(page, data!.id);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await admin.from("deadlines").select("status").eq("id", data!.id).single()).data?.status).toBe("Cancelled");
  });
});

test.describe("recurring deadlines: assistant", () => {
  test("creates a repeating deadline in one utterance when the schedule is stated (no extra question)", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "CS 101");
    await openAssistant(page);

    const { prompt } = await runMutation(page, "Add a deadline called Weekly Quiz for my CS 101 course every Monday and Wednesday at 5pm until 2030-12-11");

    expect(prompt.toLowerCase()).toMatch(/repeat|every/);
    const { data } = await admin.from("deadlines").select("recurrence_days, recurrence_end_date, due_at").eq("user_id", user.userId).is("deleted_at", null);
    expect(data).toHaveLength(1);
    expect(data![0].recurrence_days).toEqual([1, 3]);
    expect(data![0].recurrence_end_date).toBe("2030-12-11");
    expect([1, 3]).toContain(new Date(data![0].due_at).getUTCDay());
  });

  test("asks whether it repeats, then resolves 'yes, every Friday until ...'", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "CS 101");
    await openAssistant(page);

    expect(await askAssistant(page, "Add a deadline called Reading Response for my CS 101 course due 2030-03-15 at 5pm")).toMatch(/repeat/i);
    await runMutation(page, "Yes, every Friday until 2030-05-31");

    const { data } = await admin.from("deadlines").select("recurrence_days, recurrence_end_date, due_at").eq("user_id", user.userId).is("deleted_at", null);
    expect(data).toHaveLength(1);
    expect(data![0].recurrence_days).toEqual([5]);
    expect(data![0].recurrence_end_date).toBe("2030-05-31");
    expect(data![0].due_at).toContain("2030-03-15");
  });

  test("cancelling a repeating deadline asks the scope; 'just this one' keeps the series going", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const { seriesId } = await seedRecurring(user.userId, courseId, "Weekly Quiz");
    await openAssistant(page);

    expect(await askAssistant(page, "Cancel my Weekly Quiz deadline")).toMatch(/series/i);
    await runMutation(page, "Just this one");

    await expect.poll(async () => (await seriesRows(seriesId)).map((row) => row.status)).toEqual(["Cancelled", "Not Started"]);
  });

  test("cancelling a repeating deadline: 'the whole series' cancels everything", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const { seriesId } = await seedRecurring(user.userId, courseId, "Weekly Quiz");
    await openAssistant(page);

    expect(await askAssistant(page, "Cancel my Weekly Quiz deadline")).toMatch(/series/i);
    await runMutation(page, "The whole series");

    await expect.poll(async () => (await seriesRows(seriesId)).map((row) => row.status)).toEqual(["Cancelled"]);
  });
});
