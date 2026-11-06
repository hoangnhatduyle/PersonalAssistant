import { expect, test, type Page } from "@playwright/test";
import { admin, createUserAndSignIn, seedCourse } from "./fixtures";

// Covers the universal DatePicker / DateTimeField (src/components/ui/DatePicker.tsx,
// DateTimeField.tsx) through the real "New deadline" dialog: calendar popover,
// typing, quick-pick chips, Escape handling inside a Dialog, the profile time
// zone, and the popover staying on-screen on a phone-width viewport.

async function openNewDeadline(page: Page): Promise<void> {
  await page.goto("/courses/deadlines");
  await page.getByRole("button", { name: "New deadline" }).click();
  await expect(page.getByRole("dialog", { name: "New deadline" })).toBeVisible();
}

/** Sets the profile time zone. The preferences row is created lazily on first read, so upsert rather than update. */
async function setProfileTimezone(userId: string, timezone: string): Promise<void> {
  const { error } = await admin.from("user_preferences").upsert({ user_id: userId, timezone }, { onConflict: "user_id" });
  expect(error).toBeNull();
}

/** Today's calendar date in an IANA zone, as YYYY-MM-DD. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

test.describe("DatePicker in forms", () => {
  test("the calendar button opens a calendar, picking a day fills the field and closes it", async ({ page }) => {
    await createUserAndSignIn(page);
    await openNewDeadline(page);

    await page.getByRole("button", { name: "Open calendar" }).first().click();
    const calendar = page.getByRole("dialog", { name: "Choose date" });
    await expect(calendar).toBeVisible();

    await calendar.getByRole("button", { name: "Next week" }).click();
    await expect(calendar).toBeHidden();
    await expect(page.locator("#due_at")).not.toHaveValue("");
    // The time input is enabled once there is a date, defaulting to 11:59 PM for a deadline.
    await expect(page.locator("#due_at-time")).toHaveValue("23:59");
  });

  test("Escape closes only the calendar, not the dialog behind it", async ({ page }) => {
    await createUserAndSignIn(page);
    await openNewDeadline(page);

    await page.getByRole("button", { name: "Open calendar" }).first().click();
    await expect(page.getByRole("dialog", { name: "Choose date" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Choose date" })).toBeHidden();
    await expect(page.getByRole("dialog", { name: "New deadline" })).toBeVisible();
    await expect(page.locator("#due_at")).toBeFocused();

    // With the calendar gone, Escape reaches the dialog as before.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "New deadline" })).toBeHidden();
  });

  test("typing M/D/YYYY or YYYY-MM-DD is accepted, and an unparseable entry reverts on blur", async ({ page }) => {
    await createUserAndSignIn(page);
    await openNewDeadline(page);

    const due = page.locator("#due_at");
    await due.fill("11/10/2030");
    await due.blur();
    await expect(due).toHaveValue("11/10/2030");

    await due.fill("2031-01-05");
    await due.blur();
    await expect(due).toHaveValue("1/5/2031");

    await due.fill("garbage");
    await expect(due).toHaveAttribute("aria-invalid", "true");
    await due.blur();
    await expect(due).toHaveValue("1/5/2031");
  });

  test("the due date is saved in the profile time zone, not the browser's", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "CS 101");
    await setProfileTimezone(user.userId, "America/Detroit");

    await openNewDeadline(page);
    await page.locator("#course_id").selectOption({ label: "CS 101" });
    await page.locator("#title").fill("Timezone check");
    await page.locator("#due_at").fill("2030-11-10");
    await page.locator("#due_at-time").fill("23:59");
    await page.getByRole("button", { name: "Create deadline" }).click();
    await expect(page.getByRole("dialog", { name: "New deadline" })).toBeHidden();

    // 11:59 PM on Nov 10 in Detroit (EST, UTC-5) is 04:59 UTC the next day.
    await expect
      .poll(async () => {
        const { data } = await admin.from("deadlines").select("due_at").eq("user_id", user.userId).eq("title", "Timezone check");
        return data?.[0] ? new Date(data[0].due_at as string).toISOString() : null;
      })
      .toBe("2030-11-11T04:59:00.000Z");
  });

  test("the Today chip is today in the profile time zone", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    // Far enough east that it is often already "tomorrow" in UTC terms; the assertion uses the zone's own date either way.
    const zone = "Pacific/Auckland";
    await setProfileTimezone(user.userId, zone);

    await openNewDeadline(page);
    await page.getByRole("button", { name: "Open calendar" }).first().click();
    await page.getByRole("dialog", { name: "Choose date" }).getByRole("button", { name: "Today", exact: true }).click();

    const [year, month, day] = todayIn(zone).split("-").map(Number);
    await expect(page.locator("#due_at")).toHaveValue(`${month}/${day}/${year}`);
  });

  test("the calendar stays inside a 320px-wide viewport and is not clipped by the dialog", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await createUserAndSignIn(page);
    await openNewDeadline(page);

    await page.getByRole("button", { name: "Open calendar" }).first().click();
    const calendar = page.getByRole("dialog", { name: "Choose date" });
    await expect(calendar).toBeVisible();

    const box = await calendar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    // A day button inside it is reachable (not covered by the dialog's overflow clipping).
    await calendar.getByRole("gridcell").nth(10).getByRole("button").click();
    await expect(calendar).toBeHidden();
  });
});
