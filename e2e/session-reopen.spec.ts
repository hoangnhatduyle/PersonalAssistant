import { expect, test } from "@playwright/test";
import { createDeadline, createSession } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn, seedCourse } from "./fixtures";

// Traces: supabase/migrations/0060_reopen_session_and_event_status.sql — a done or
// skipped session can go back to planned, and the deadline's progress drops with it.

test.describe("reopening a session", () => {
  test("Mark Done raises the deadline's progress, Reopen lowers it again, and the deadline stays In Progress", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const deadlineId = await createDeadline(admin, user.userId, courseId, { title: "Report" });
    const first = await createSession(admin, user.userId, deadlineId, { title: "Part 1" });
    await createSession(admin, user.userId, deadlineId, { title: "Part 2" });

    await page.goto(`/courses/deadlines/${deadlineId}`);
    const row = page.getByRole("listitem").filter({ hasText: "Part 1" });
    await expect(page.getByText("0/2")).toBeVisible();

    await row.getByRole("button", { name: "Mark Done" }).click();
    await expect(page.getByText("1/2")).toBeVisible();
    await expect(row.getByText("done", { exact: true })).toBeVisible();
    // Done offers only Reopen.
    await expect(row.getByRole("button", { name: "Mark Skipped" })).toHaveCount(0);

    await row.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText("0/2")).toBeVisible();
    await expect(row.getByRole("button", { name: "Mark Done" })).toBeVisible();

    const { data: session } = await admin.from("appointments").select("session_status").eq("id", first).single();
    expect(session?.session_status).toBe("planned");
    // Reopening never reverts the deadline's own status (it advanced to In Progress when the first session finished).
    const { data: deadline } = await admin.from("deadlines").select("status").eq("id", deadlineId).single();
    expect(deadline?.status).toBe("In Progress");
  });

  test("a skipped session can be reopened too", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const deadlineId = await createDeadline(admin, user.userId, courseId, { title: "Report" });
    await createSession(admin, user.userId, deadlineId, { title: "Part 1" });

    await page.goto(`/courses/deadlines/${deadlineId}`);
    const row = page.getByRole("listitem").filter({ hasText: "Part 1" });
    await row.getByRole("button", { name: "Mark Skipped" }).click();
    await expect(row.getByRole("button", { name: "Reopen" })).toBeVisible();
    await row.getByRole("button", { name: "Reopen" }).click();
    await expect(row.getByRole("button", { name: "Mark Done" })).toBeVisible();
  });
});
