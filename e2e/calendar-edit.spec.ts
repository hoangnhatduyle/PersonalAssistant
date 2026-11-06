import { expect, test, type Locator, type Page } from "@playwright/test";
import { createAppointment, createCourse, createDeadline, createTask } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn, currentWeekDateKeys, seedCourse } from "./fixtures";

// Editing the calendar directly (C1): drag a block to move it, drag its bottom
// edge to resize it, or use the Adjust time dialog (the phone/keyboard route).
// One-off appointments move and resize; deadlines and tasks move. A move into
// the past asks first. Recurring items are read-only until occurrence overrides.

const PIXELS_PER_MINUTE = 1.2;
const WEEK = currentWeekDateKeys();
const [WEDNESDAY, THURSDAY] = [WEEK[3], WEEK[4]];
// Deadlines and tasks ask before moving into the past, so their drag tests run in NEXT week, where every slot is
// in the future whatever day the suite runs on.
const NEXT_WEEK = currentWeekDateKeys(1);
const [NEXT_WEDNESDAY, NEXT_FRIDAY] = [NEXT_WEEK[3], NEXT_WEEK[5]];

const block = (page: Page, prefix: string, id: string) => page.locator(`[data-event-id="${prefix}-${id}"]`);
const column = (page: Page, date: string) => page.locator(`[data-testid="day-column"][data-date="${date}"]`);

/** Drags a block with the real mouse: from inside it to `dx` pixels right and `dy` down. */
async function dragBlockBy(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + 20;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await page.mouse.up();
}

async function columnWidth(page: Page, date: string): Promise<number> {
  return (await column(page, date).boundingBox())!.width;
}

test.describe("calendar edit: one-off appointments", () => {
  test("drag a block to another day and time", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Dentist", date: WEDNESDAY, time: "10:00", duration_minutes: 60 });

    await page.goto("/calendar");
    // One column to the right (Thursday) and one hour down (60 min * 1.2 px/min).
    await dragBlockBy(page, block(page, "appointment", id), await columnWidth(page, WEDNESDAY), 60 * PIXELS_PER_MINUTE);

    await expect
      .poll(async () => {
        const { data } = await admin.from("appointments").select("date, time, duration_minutes").eq("id", id).single();
        return data;
      })
      .toEqual({ date: THURSDAY, time: "11:00", duration_minutes: 60 });
    // The grid reflects it too: the block is now in Thursday's column.
    await expect(column(page, THURSDAY).locator(`[data-event-id="appointment-${id}"]`)).toHaveCount(1);
    // Releasing over empty column background must not also open the "add to calendar" picker there.
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("drag the bottom edge to change the duration", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Workshop", date: WEDNESDAY, time: "10:00", duration_minutes: 60 });

    await page.goto("/calendar");
    const target = block(page, "appointment", id);
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    const handle = page.getByTestId("resize-handle").first();
    const handleBox = (await handle.boundingBox())!;
    const x = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30 * PIXELS_PER_MINUTE, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const { data } = await admin.from("appointments").select("date, time, duration_minutes").eq("id", id).single();
        return data;
      })
      .toEqual({ date: WEDNESDAY, time: "10:00", duration_minutes: 90 });
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("Escape during a drag cancels it", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Standup", date: WEDNESDAY, time: "10:00", duration_minutes: 60 });

    await page.goto("/calendar");
    const target = block(page, "appointment", id);
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + 200, { steps: 8 });
    await expect(page.getByTestId("drag-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();

    await expect(page.getByTestId("drag-preview")).toHaveCount(0);
    // Letting go after Escape is not a click on the background either.
    await expect(page.getByRole("menu")).toHaveCount(0);
    const { data } = await admin.from("appointments").select("date, time").eq("id", id).single();
    expect(data).toEqual({ date: WEDNESDAY, time: "10:00" });
  });
});

// page.route can't see requests a service worker handles, so block the app's own worker to fail one save on purpose.
test.describe("calendar edit: a failing save", () => {
  test.use({ serviceWorkers: "block" });

  test("a failed save rolls the block back and says so", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Haircut", date: WEDNESDAY, time: "10:00", duration_minutes: 60 });
    await page.route(`**/api/appointments/${id}`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: "boom", data: null }) })
        : route.continue(),
    );

    await page.goto("/calendar");
    await dragBlockBy(page, block(page, "appointment", id), await columnWidth(page, WEDNESDAY), 60 * PIXELS_PER_MINUTE);

    await expect(page.getByText("Could not move that appointment")).toBeVisible();
    // Back in Wednesday's column, and nothing was written.
    await expect(column(page, WEDNESDAY).locator(`[data-event-id="appointment-${id}"]`)).toHaveCount(1);
    const { data } = await admin.from("appointments").select("date, time").eq("id", id).single();
    expect(data).toEqual({ date: WEDNESDAY, time: "10:00" });
  });
});

test.describe("calendar edit: deadlines and tasks", () => {
  test("drag a deadline to another day and time, without opening it", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const [year, month, day] = NEXT_WEDNESDAY.split("-").map(Number);
    const id = await createDeadline(admin, user.userId, courseId, {
      title: "Essay",
      due_at: new Date(Date.UTC(year, month - 1, day, 9, 0)).toISOString(),
    });

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Next week" }).click();
    // Two columns right (Friday) and two hours down.
    await dragBlockBy(page, block(page, "deadline", id), 2 * (await columnWidth(page, NEXT_WEDNESDAY)), 120 * PIXELS_PER_MINUTE);

    await expect
      .poll(async () => {
        const { data } = await admin.from("deadlines").select("due_at").eq("id", id).single();
        return data ? new Date(data.due_at as string).toISOString() : null;
      })
      .toBe(`${NEXT_FRIDAY}T11:00:00.000Z`);
    // Dropping must not also follow the block's link to the deadline page.
    await expect(page).toHaveURL(/\/calendar$/);
  });

  test("a task has no resize handle but can be moved", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const [year, month, day] = NEXT_WEDNESDAY.split("-").map(Number);
    const id = await createTask(admin, user.userId, { title: "Read paper", due_at: new Date(Date.UTC(year, month - 1, day, 9, 0)).toISOString() });

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Next week" }).click();
    const target = block(page, "task", id);
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await expect(page.getByTestId("resize-handle")).toHaveCount(0);

    await dragBlockBy(page, target, 0, 60 * PIXELS_PER_MINUTE);
    await expect
      .poll(async () => {
        const { data } = await admin.from("tasks").select("due_at").eq("id", id).single();
        return data ? new Date(data.due_at as string).toISOString() : null;
      })
      .toBe(`${NEXT_WEDNESDAY}T10:00:00.000Z`);
  });

  test("moving a deadline into the past asks first: Cancel leaves it, Move anyway writes it", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const [year, month, day] = WEDNESDAY.split("-").map(Number);
    const original = new Date(Date.UTC(year, month - 1, day, 12, 0)).toISOString();
    const id = await createDeadline(admin, user.userId, courseId, { title: "Essay", due_at: original });
    const dueAt = async () => {
      const { data } = await admin.from("deadlines").select("due_at").eq("id", id).single();
      return new Date(data!.due_at as string).toISOString();
    };

    await page.goto("/calendar");
    const openAdjust = async () => {
      const target = block(page, "deadline", id);
      await target.scrollIntoViewIfNeeded();
      await target.hover();
      await page.getByRole("button", { name: "Adjust time for Essay" }).click();
      await expect(page.getByRole("dialog", { name: "Adjust time" })).toBeVisible();
    };

    // Cancel path.
    await openAdjust();
    await page.getByRole("dialog", { name: "Adjust time" }).getByLabel("Date").fill("2020-01-02");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "Move into the past?" })).toBeVisible();
    await page.getByRole("dialog", { name: "Move into the past?" }).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Move into the past?" })).toBeHidden();
    expect(await dueAt()).toBe(original);

    // Confirm path.
    await openAdjust();
    await page.getByRole("dialog", { name: "Adjust time" }).getByLabel("Date").fill("2020-01-02");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("dialog", { name: "Move into the past?" }).getByRole("button", { name: "Move anyway" }).click();
    await expect.poll(dueAt).toBe("2020-01-02T12:00:00.000Z");
  });
});

test.describe("calendar edit: read-only blocks", () => {
  test("a course block has no resize handle and no Adjust time button", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await createCourse(admin, user.userId, {
      name: "Algorithms",
      meeting_blocks: [{ days: [3], startMinutes: 600, endMinutes: 660 }],
    });

    await page.goto("/calendar");
    const target = page.locator('[data-testid="calendar-event"]').first();
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await expect(page.getByTestId("resize-handle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Adjust time/ })).toHaveCount(0);
  });
});

test.describe("calendar edit: phone width", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("Adjust time sets a new time from the dialog (touch doesn't drag)", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const todayKey = currentWeekDateKeys()[new Date().getDay()];
    const id = await createAppointment(admin, user.userId, { title: "Dentist", date: todayKey, time: "10:00", duration_minutes: 60 });

    await page.goto("/calendar");
    const target = block(page, "appointment", id);
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await page.getByRole("button", { name: "Adjust time for Dentist" }).click();

    const dialog = page.getByRole("dialog", { name: "Adjust time" });
    await dialog.getByLabel("Start", { exact: true }).fill("14:00");
    // Changing the start carries the end with it, keeping the hour's duration.
    await expect(dialog.getByLabel("End", { exact: true })).toHaveValue("15:00");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect
      .poll(async () => {
        const { data } = await admin.from("appointments").select("date, time, duration_minutes").eq("id", id).single();
        return data;
      })
      .toEqual({ date: todayKey, time: "14:00", duration_minutes: 60 });
  });
});

// Recurring items stay read-only here; see the C2 occurrence-override phase.
