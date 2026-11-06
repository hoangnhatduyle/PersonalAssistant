import { expect, test } from "@playwright/test";
import { createAppointment, createCourse } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn } from "./fixtures";

// Traces: supabase/migrations/0061_occurrence_overrides.sql and
// PUT/DELETE /api/{courses|appointments}/[id]/occurrences — an exception to
// ONE occurrence of a recurring series, leaving the series itself alone.

// Thursdays: 2030-03-14 and 2030-03-21 are in the future; 2020-03-12 is long past.
const THURSDAY = "2030-03-14";
const NEXT_THURSDAY = "2030-03-21";
const PAST_THURSDAY = "2020-03-12";
const CLASS_START = 510; // 8:30 AM
const CLASS_END = 990; // 4:30 PM

const THURSDAY_BLOCK = { days: [4], startMinutes: CLASS_START, endMinutes: CLASS_END };

const half = (date: string) => ({ original_date: date, original_start_minutes: CLASS_START, new_date: date, new_start_minutes: 780, new_end_minutes: CLASS_END });

test.describe("course occurrence overrides", () => {
  test("a half day: the one Thursday shrinks, the series and the next Thursday do not", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { name: "First Solar", meeting_blocks: [THURSDAY_BLOCK] });

    const put = await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });
    expect(put.ok()).toBe(true);
    expect((await put.json()).data).toEqual({
      original_date: THURSDAY,
      original_start_minutes: CLASS_START,
      is_cancelled: false,
      new_date: THURSDAY,
      new_start_minutes: 780,
      new_end_minutes: CLASS_END,
    });

    // The series itself is untouched.
    const { data: course } = await admin.from("courses").select("meeting_blocks").eq("id", courseId).single();
    expect(course?.meeting_blocks).toEqual([THURSDAY_BLOCK]);

    // The list endpoint carries the exception, and only that one.
    const list = await page.request.get("/api/courses");
    const [listed] = (await list.json()).data as Array<{ id: string; occurrence_overrides: Array<{ original_date: string }> }>;
    expect(listed.id).toBe(courseId);
    expect(listed.occurrence_overrides.map((override) => override.original_date)).toEqual([THURSDAY]);

    const detail = await page.request.get(`/api/courses/${courseId}`);
    expect((await detail.json()).data.occurrence_overrides).toHaveLength(1);
  });

  test("changing the same occurrence again replaces its exception rather than adding a second", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { meeting_blocks: [THURSDAY_BLOCK] });

    await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });
    const second = await page.request.put(`/api/courses/${courseId}/occurrences`, {
      data: { ...half(THURSDAY), new_date: NEXT_THURSDAY, new_start_minutes: 600, new_end_minutes: 660 },
    });
    expect(second.ok()).toBe(true);

    const { data: rows } = await admin.from("occurrence_overrides").select("new_date, new_start_minutes").eq("course_id", courseId);
    expect(rows).toEqual([{ new_date: NEXT_THURSDAY, new_start_minutes: 600 }]);
  });

  test("cancelling clears any earlier move's times", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { meeting_blocks: [THURSDAY_BLOCK] });

    await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });
    const cancel = await page.request.put(`/api/courses/${courseId}/occurrences`, {
      data: { original_date: THURSDAY, original_start_minutes: CLASS_START, is_cancelled: true },
    });
    expect(cancel.ok()).toBe(true);

    const { data: rows } = await admin.from("occurrence_overrides").select("is_cancelled, new_date, new_start_minutes, new_end_minutes").eq("course_id", courseId);
    expect(rows).toEqual([{ is_cancelled: true, new_date: null, new_start_minutes: null, new_end_minutes: null }]);
  });

  test("reverting removes the exception, and reverting again is harmless", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { meeting_blocks: [THURSDAY_BLOCK] });
    await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });

    const url = `/api/courses/${courseId}/occurrences?original_date=${THURSDAY}&original_start_minutes=${CLASS_START}`;
    expect((await page.request.delete(url)).ok()).toBe(true);
    const { data: rows } = await admin.from("occurrence_overrides").select("id").eq("course_id", courseId);
    expect(rows).toHaveLength(0);
    expect((await page.request.delete(url)).ok()).toBe(true);
  });

  test("refuses an occurrence the series doesn't have, and malformed or contradictory payloads", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { meeting_blocks: [THURSDAY_BLOCK] });
    const put = (data: unknown) => page.request.put(`/api/courses/${courseId}/occurrences`, { data });

    // 2030-03-13 is a Wednesday; the class meets Thursdays.
    expect((await put({ ...half(THURSDAY), original_date: "2030-03-13" })).status()).toBe(400);
    // Right day, but the class doesn't start at 9:00.
    expect((await put({ ...half(THURSDAY), original_start_minutes: 540 })).status()).toBe(400);
    expect((await put({ original_date: THURSDAY, original_start_minutes: CLASS_START })).status()).toBe(400); // a move with no new time
    expect((await put({ ...half(THURSDAY), new_end_minutes: 700 })).status()).toBe(400); // end before start
    expect((await put({ ...half(THURSDAY), new_end_minutes: 1440 })).status()).toBe(400); // crosses midnight
    expect((await put({ ...half(THURSDAY), is_cancelled: true })).status()).toBe(400); // cancelled yet carries a time
    expect((await put("nope")).status()).toBe(400);

    const { data: rows } = await admin.from("occurrence_overrides").select("id").eq("course_id", courseId);
    expect(rows).toHaveLength(0);
  });

  test("refuses an occurrence outside the series' date range", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, {
      meeting_blocks: [THURSDAY_BLOCK],
      recurrence_start_date: "2030-01-01",
      recurrence_end_date: "2030-03-01",
    });
    const response = await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });
    expect(response.status()).toBe(400);
  });

  test("another user's course is not found, for both PUT and DELETE", async ({ page }) => {
    const owner = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, owner.userId, { meeting_blocks: [THURSDAY_BLOCK] });
    await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });

    // Sign in as someone else in the same browser context.
    await page.context().clearCookies();
    await createUserAndSignIn(page);
    expect((await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(NEXT_THURSDAY) })).status()).toBe(404);
    expect(
      (await page.request.delete(`/api/courses/${courseId}/occurrences?original_date=${THURSDAY}&original_start_minutes=${CLASS_START}`)).status(),
    ).toBe(404);

    const { data: rows } = await admin.from("occurrence_overrides").select("original_date").eq("course_id", courseId);
    expect(rows).toEqual([{ original_date: THURSDAY }]);
  });

  test("a deleted course can't take overrides", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { meeting_blocks: [THURSDAY_BLOCK], deleted_at: new Date().toISOString() });
    expect((await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) })).status()).toBe(404);
  });
});

test.describe("editing the weekly pattern drops stale exceptions", () => {
  async function seed(page: import("@playwright/test").Page) {
    const user = await createUserAndSignIn(page);
    const courseId = await createCourse(admin, user.userId, { name: "First Solar", meeting_blocks: [THURSDAY_BLOCK] });
    await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(THURSDAY) });
    await page.request.put(`/api/courses/${courseId}/occurrences`, { data: half(PAST_THURSDAY) });
    const dates = async () => {
      const { data } = await admin.from("occurrence_overrides").select("original_date").eq("course_id", courseId).order("original_date");
      return (data ?? []).map((row) => row.original_date);
    };
    return { courseId, dates };
  }

  test("a real change to the time windows drops FUTURE exceptions and keeps past ones", async ({ page }) => {
    const { courseId, dates } = await seed(page);
    expect(await dates()).toEqual([PAST_THURSDAY, THURSDAY]);

    const patch = await page.request.patch(`/api/courses/${courseId}`, {
      data: { meeting_blocks: [{ days: [4], startMinutes: 540, endMinutes: 990 }] },
    });
    expect(patch.ok()).toBe(true);
    expect(await dates()).toEqual([PAST_THURSDAY]);
  });

  test("resubmitting the same pattern (or editing an unrelated field) keeps them", async ({ page }) => {
    const { courseId, dates } = await seed(page);

    expect((await page.request.patch(`/api/courses/${courseId}`, { data: { meeting_blocks: [THURSDAY_BLOCK] } })).ok()).toBe(true);
    expect(await dates()).toEqual([PAST_THURSDAY, THURSDAY]);

    expect((await page.request.patch(`/api/courses/${courseId}`, { data: { name: "First Solar (PGT1)" } })).ok()).toBe(true);
    expect(await dates()).toEqual([PAST_THURSDAY, THURSDAY]);
  });

  test("changing the recurrence date range counts as a pattern change", async ({ page }) => {
    const { courseId, dates } = await seed(page);
    expect((await page.request.patch(`/api/courses/${courseId}`, { data: { recurrence_end_date: "2031-12-31" } })).ok()).toBe(true);
    expect(await dates()).toEqual([PAST_THURSDAY]);
  });
});

test.describe("recurring appointment occurrence overrides", () => {
  const TUESDAY = "2030-03-12"; // a Tuesday
  const TUESDAY_BLOCK = { days: [2], startMinutes: 540, endMinutes: 600 };

  test("a recurring appointment takes overrides and lists them", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Standup", time: null, duration_minutes: null, meeting_blocks: [TUESDAY_BLOCK] });

    const put = await page.request.put(`/api/appointments/${id}/occurrences`, {
      data: { original_date: TUESDAY, original_start_minutes: 540, new_date: TUESDAY, new_start_minutes: 600, new_end_minutes: 660 },
    });
    expect(put.ok()).toBe(true);

    const list = await page.request.get("/api/appointments");
    const rows = (await list.json()).data as Array<{ id: string; occurrence_overrides: unknown[] }>;
    expect(rows.find((row) => row.id === id)?.occurrence_overrides).toHaveLength(1);

    const url = `/api/appointments/${id}/occurrences?original_date=${TUESDAY}&original_start_minutes=540`;
    expect((await page.request.delete(url)).ok()).toBe(true);
    const { data } = await admin.from("occurrence_overrides").select("id").eq("appointment_id", id);
    expect(data).toHaveLength(0);
  });

  test("a one-off appointment has no occurrences to change", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Dentist" });
    const response = await page.request.put(`/api/appointments/${id}/occurrences`, {
      data: { original_date: TUESDAY, original_start_minutes: 540, is_cancelled: true },
    });
    expect(response.status()).toBe(400);
  });

  test("editing a recurring appointment's pattern drops its future exceptions", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const id = await createAppointment(admin, user.userId, { title: "Standup", time: null, duration_minutes: null, meeting_blocks: [TUESDAY_BLOCK] });
    await page.request.put(`/api/appointments/${id}/occurrences`, { data: { original_date: TUESDAY, original_start_minutes: 540, is_cancelled: true } });

    const patch = await page.request.patch(`/api/appointments/${id}`, { data: { meeting_blocks: [{ days: [2], startMinutes: 570, endMinutes: 630 }] } });
    expect(patch.ok()).toBe(true);
    const { data } = await admin.from("occurrence_overrides").select("id").eq("appointment_id", id);
    expect(data).toHaveLength(0);
  });
});
