import { expect, test } from "@playwright/test";
import { createDeadline } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn, seedCourse, setProfileTimezone } from "./fixtures";
import { zonedPartsToIso } from "@/lib/format/zoned-datetime";

// Calendar week grid foundations (C0): every open deadline in the week renders
// (the lists are no longer capped at the API's default page of 20), and
// deadlines/tasks sit on the day and time they read in the profile time zone,
// not the browser's.

/** The Wednesday of the week the grid shows by default (Sunday-start, browser-local), as YYYY-MM-DD. */
function thisWeeksWednesday(): string {
  const now = new Date();
  const wednesday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 3);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wednesday.getFullYear()}-${pad(wednesday.getMonth() + 1)}-${pad(wednesday.getDate())}`;
}

test.describe("calendar week grid", () => {
  test("shows every open deadline in the week, not just the first 20", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const wednesday = thisWeeksWednesday();
    const [year, month, day] = wednesday.split("-").map(Number);

    for (let index = 0; index < 22; index += 1) {
      // Noon-ish local on Wednesday, a minute apart; well inside the week whatever the browser/profile zone offset.
      const dueAt = new Date(year, month - 1, day, 12, index).toISOString();
      await createDeadline(admin, user.userId, courseId, { title: `Deadline ${index}`, due_at: dueAt });
    }

    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-event")).toHaveCount(22);
  });

  test("places a deadline on the day and time it reads in the profile time zone", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    // Auckland is far from any CI/dev machine's zone, so a device-zone placement would land on a different day or hour.
    await setProfileTimezone(user.userId, "Pacific/Auckland");

    const wednesday = thisWeeksWednesday();
    const dueAt = zonedPartsToIso(wednesday, "12:00", "Pacific/Auckland");
    expect(dueAt).not.toBeNull();
    const deadlineId = await createDeadline(admin, user.userId, courseId, { title: "Zone check", due_at: dueAt });

    await page.goto("/calendar");
    const block = page.locator(`[data-event-id="deadline-${deadlineId}"]`);
    await expect(block).toBeVisible();
    await expect(block).toContainText("12 PM");
    // It sits in Wednesday's column, per the profile zone.
    await expect(page.locator(`[data-testid="day-column"][data-date="${wednesday}"] [data-event-id="deadline-${deadlineId}"]`)).toHaveCount(1);
  });
});
