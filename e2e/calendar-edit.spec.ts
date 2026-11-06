import { expect, test, type Locator, type Page } from "@playwright/test";
import { createAppointment, createCourse, createDeadline, createTask, walkTransitions } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn, currentWeekDateKeys, seedCourse } from "./fixtures";

// Editing the calendar directly (C1): drag a block to move it, drag its bottom
// edge to resize it, or use the Adjust time dialog (the phone/keyboard route).
// One-off appointments move and resize; deadlines and tasks move. A move into
// the past asks first. A recurring course asks "This occurrence / All occurrences" (C2.5).

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
async function dragBlockBy(page: Page, target: Locator, dx: number, dy: number, grabOffsetY = 20): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + grabOffsetY;
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

test.describe("calendar edit: a recurring course (First Solar)", () => {
  const SERIES = [{ days: [1, 2, 4, 5], startMinutes: 510, endMinutes: 990 }]; // Mon/Tue/Thu/Fri 8:30–4:30
  const THURSDAY_ROW = WEEK[4];
  const FRIDAY_ROW = WEEK[5];

  const seed = async (page: Page) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { name: "First Solar", meeting_blocks: SERIES });
    return { user, courseId };
  };
  const courseBlock = (page: Page, courseId: string, date: string) =>
    column(page, date).locator(`[data-event-id^="course-${courseId}-0-"]`);
  const overrides = async (courseId: string) => {
    const { data } = await admin
      .from("occurrence_overrides")
      .select("original_date, original_start_minutes, is_cancelled, new_date, new_start_minutes, new_end_minutes")
      .eq("course_id", courseId);
    return data ?? [];
  };
  const seriesBlocks = async (courseId: string) => {
    const { data } = await admin.from("courses").select("meeting_blocks").eq("id", courseId).single();
    return data?.meeting_blocks;
  };
  const scopeDialog = (page: Page) => page.getByRole("dialog", { name: "Change recurring event" });

  /** Opens Adjust time on that day's block and moves its start to 13:00 (the half day), keeping the end. */
  async function startHalfDay(page: Page, courseId: string) {
    const target = courseBlock(page, courseId, THURSDAY_ROW);
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await page.getByRole("button", { name: "Adjust time for First Solar" }).click();
    const dialog = page.getByRole("dialog", { name: "Adjust time" });
    await dialog.getByLabel("Start", { exact: true }).fill("13:00");
    // Moving the start carries the end; put the end back to 4:30 PM.
    await dialog.getByLabel("End", { exact: true }).fill("16:30");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(scopeDialog(page)).toBeVisible();
  }

  test("This occurrence: only that Thursday is shortened, the series and every other day are untouched", async ({ page }) => {
    const { courseId } = await seed(page);
    await page.goto("/calendar");
    await startHalfDay(page, courseId);
    await scopeDialog(page).getByRole("button", { name: "This occurrence" }).click();

    await expect.poll(() => overrides(courseId)).toEqual([
      { original_date: THURSDAY_ROW, original_start_minutes: 510, is_cancelled: false, new_date: THURSDAY_ROW, new_start_minutes: 780, new_end_minutes: 990 },
    ]);
    expect(await seriesBlocks(courseId)).toEqual(SERIES);
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toHaveAttribute("data-adjusted", "true");
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toContainText("1 PM");
    await expect(courseBlock(page, courseId, FRIDAY_ROW)).not.toHaveAttribute("data-adjusted", "true");
    await expect(courseBlock(page, courseId, FRIDAY_ROW)).toContainText("8:30 AM");
    // And it survives a reload (it is stored, not just drawn).
    await page.reload();
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toHaveAttribute("data-adjusted", "true");
  });

  test("All occurrences: every Thursday changes, Monday, Tuesday and Friday do not", async ({ page }) => {
    const { courseId } = await seed(page);
    await page.goto("/calendar");
    await startHalfDay(page, courseId);
    await scopeDialog(page).getByRole("button", { name: "All occurrences" }).click();

    await expect
      .poll(() => seriesBlocks(courseId))
      .toEqual([
        { days: [1, 2, 5], startMinutes: 510, endMinutes: 990 },
        { days: [4], startMinutes: 780, endMinutes: 990 },
      ]);
    expect(await overrides(courseId)).toEqual([]);
    await expect(courseBlock(page, courseId, FRIDAY_ROW)).toContainText("8:30 AM");
  });

  test("Cancel in the question changes nothing", async ({ page }) => {
    const { courseId } = await seed(page);
    await page.goto("/calendar");
    await startHalfDay(page, courseId);
    await scopeDialog(page).getByRole("button", { name: "Cancel" }).click();

    await expect(scopeDialog(page)).toBeHidden();
    expect(await overrides(courseId)).toEqual([]);
    expect(await seriesBlocks(courseId)).toEqual(SERIES);
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toContainText("8:30 AM");
  });

  test("dragging a recurring block asks the same question", async ({ page }) => {
    const { courseId } = await seed(page);
    await page.goto("/calendar");
    // One hour down: 8:30 -> 9:30.
    // Grabbed mid-block: a tall course block's top can sit at the scroll edge, where holding the mouse auto-scrolls.
    await dragBlockBy(page, courseBlock(page, courseId, THURSDAY_ROW), 0, 60 * PIXELS_PER_MINUTE, 200);
    await expect(scopeDialog(page)).toBeVisible();
    await scopeDialog(page).getByRole("button", { name: "This occurrence" }).click();

    await expect
      .poll(async () => (await overrides(courseId))[0]?.new_start_minutes)
      .toBe(570);
    expect(await seriesBlocks(courseId)).toEqual(SERIES);
  });

  test("Skip this day removes just that day, and only that day", async ({ page }) => {
    const { courseId } = await seed(page);
    await page.goto("/calendar");
    const target = courseBlock(page, courseId, THURSDAY_ROW);
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await page.getByRole("button", { name: "Adjust time for First Solar" }).click();
    await page.getByRole("dialog", { name: "Adjust time" }).getByRole("button", { name: "Skip this day" }).click();

    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toHaveCount(0);
    await expect(courseBlock(page, courseId, FRIDAY_ROW)).toHaveCount(1);
    await expect.poll(async () => (await overrides(courseId))[0]?.is_cancelled).toBe(true);

    // The block is gone from the grid, so the toast is the way back.
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => overrides(courseId)).toEqual([]);
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toHaveCount(1);
  });

  test("Revert to series drops an adjusted day's exception", async ({ page }) => {
    const { user, courseId } = await seed(page);
    await admin.from("occurrence_overrides").insert({
      user_id: user.userId,
      course_id: courseId,
      original_date: THURSDAY_ROW,
      original_start_minutes: 510,
      new_date: THURSDAY_ROW,
      new_start_minutes: 780,
      new_end_minutes: 990,
    });
    await page.goto("/calendar");
    const target = courseBlock(page, courseId, THURSDAY_ROW);
    await expect(target).toHaveAttribute("data-adjusted", "true");
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await page.getByRole("button", { name: "Adjust time for First Solar" }).click();
    await page.getByRole("dialog", { name: "Adjust time" }).getByRole("button", { name: "Revert to series" }).click();

    await expect.poll(() => overrides(courseId)).toEqual([]);
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).not.toHaveAttribute("data-adjusted", "true");
    await expect(courseBlock(page, courseId, THURSDAY_ROW)).toContainText("8:30 AM");
  });
});

test.describe("calendar edit: a recurring deadline", () => {
  // Weekly on Wednesday 10:00 UTC (next week, so every slot is in the future whatever day the suite runs).
  const WEDNESDAY_DUE = `${NEXT_WEDNESDAY}T10:00:00.000Z`;
  const WEEK_MS = 7 * 86_400_000;
  const scopeDialog = (page: Page) => page.getByRole("dialog", { name: "Change recurring event" });

  async function seed(page: Page) {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const id = await createDeadline(admin, user.userId, courseId, { title: "Weekly quiz", due_at: WEDNESDAY_DUE, recurrence_days: [3] });
    const row = async () => {
      const { data } = await admin.from("deadlines").select("due_at, recurrence_days, recurrence_series_id, recurrence_anchor_due_at").eq("id", id).single();
      return data!;
    };
    const series = async () => {
      const { data: first } = await admin.from("deadlines").select("recurrence_series_id").eq("id", id).single();
      const { data } = await admin.from("deadlines").select("due_at").eq("recurrence_series_id", first!.recurrence_series_id).order("due_at");
      return (data ?? []).map((r) => new Date(r.due_at as string).toISOString());
    };
    return { id, row, series };
  }

  /** Drags the deadline one day column to the right (Wednesday -> Thursday), same time. */
  async function dragToThursday(page: Page, id: string) {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Next week" }).click();
    await dragBlockBy(page, block(page, "deadline", id), await columnWidth(page, NEXT_WEDNESDAY), 0);
    await expect(scopeDialog(page)).toBeVisible();
  }

  test("This occurrence: it moves, the schedule does not — the next one is still on Wednesday", async ({ page }) => {
    const { id, row, series } = await seed(page);
    await dragToThursday(page, id);
    await scopeDialog(page).getByRole("button", { name: "This occurrence" }).click();

    await expect.poll(async () => new Date((await row()).due_at as string).toISOString()).toBe(`${NEXT_WEEK[4]}T10:00:00.000Z`);
    expect((await row()).recurrence_days).toEqual([3]);

    // Finishing it creates the next occurrence from the SCHEDULE (a week after Wednesday), not from Thursday.
    await walkTransitions(admin, "deadlines", id, "status", ["In Progress", "Submitted", "Completed"]);
    const dues = await series();
    expect(dues).toHaveLength(2);
    expect(dues[1]).toBe(new Date(new Date(WEDNESDAY_DUE).getTime() + WEEK_MS).toISOString());
  });

  test("All occurrences: the series moves to Thursday, so the next one is on Thursday too", async ({ page }) => {
    const { id, row, series } = await seed(page);
    await dragToThursday(page, id);
    await scopeDialog(page).getByRole("button", { name: "All occurrences" }).click();

    await expect.poll(async () => (await row()).recurrence_days).toEqual([4]);
    expect(new Date((await row()).due_at as string).toISOString()).toBe(`${NEXT_WEEK[4]}T10:00:00.000Z`);

    await walkTransitions(admin, "deadlines", id, "status", ["In Progress", "Submitted", "Completed"]);
    const dues = await series();
    expect(dues[1]).toBe(new Date(new Date(`${NEXT_WEEK[4]}T10:00:00.000Z`).getTime() + WEEK_MS).toISOString());
  });

  test("Cancel in the question leaves the deadline and its schedule alone", async ({ page }) => {
    const { id, row } = await seed(page);
    await dragToThursday(page, id);
    await scopeDialog(page).getByRole("button", { name: "Cancel" }).click();

    await expect(scopeDialog(page)).toBeHidden();
    expect(new Date((await row()).due_at as string).toISOString()).toBe(WEDNESDAY_DUE);
    expect((await row()).recurrence_anchor_due_at).toBeNull();
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
