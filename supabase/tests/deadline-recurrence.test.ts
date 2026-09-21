import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createCourse, createDeadline, walkTransitions, type TestUser } from "./helpers";

// Traces: supabase/migrations/0042_deadline_series.sql. Every occurrence of a
// recurring deadline is its own row; the next one appears when the current
// one is completed/cancelled OR comes due; cancelling can target one
// occurrence or the whole series.
//
// The user has no user_preferences row unless a test adds one, so the
// timezone is UTC. pg_cron's own per-minute sweep runs against this same DB
// while tests execute, so nothing here asserts a "before the sweep" state --
// only converged results (sweepUntilStable).

const DAY_MS = 86_400_000;

describe("recurring deadlines", () => {
  const admin = adminClient();
  let user: TestUser;
  let courseId: string;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    courseId = await createCourse(admin, user.userId);
  });

  const dow = (date: Date) => date.getUTCDay();

  async function createRecurring(dueAt: Date, overrides: Record<string, unknown> = {}): Promise<{ id: string; seriesId: string }> {
    const id = await createDeadline(admin, user.userId, courseId, {
      title: `Series ${Math.random().toString(36).slice(2)}`,
      due_at: dueAt.toISOString(),
      recurrence_days: [dow(dueAt)],
      ...overrides,
    });
    const { data } = await admin.from("deadlines").select("recurrence_series_id").eq("id", id).single();
    return { id, seriesId: data?.recurrence_series_id as string };
  }

  async function series(seriesId: string) {
    const { data, error } = await admin.from("deadlines").select("*").eq("recurrence_series_id", seriesId).order("due_at");
    if (error) throw error;
    return data ?? [];
  }

  async function finish(id: string) {
    await walkTransitions(admin, "deadlines", id, "status", ["In Progress", "Submitted", "Completed"]);
  }

  async function eligibleCount(seriesId: string): Promise<number> {
    const { count } = await admin
      .from("deadlines")
      .select("id", { count: "exact", head: true })
      .eq("recurrence_series_id", seriesId)
      .is("recurrence_spawned_at", null)
      .is("deleted_at", null)
      .not("status", "in", "(Completed,Cancelled)")
      .lte("due_at", new Date().toISOString());
    return count ?? 0;
  }

  /** Runs the sweep until this series has nothing left due -- tolerant of pg_cron holding a row lock mid-run. */
  async function sweepUntilStable(seriesId: string) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await admin.rpc("spawn_due_deadline_occurrences");
      expect(error).toBeNull();
      if ((await eligibleCount(seriesId)) === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("sweep did not converge");
  }

  it("gives a recurring deadline a series id (its own id) and leaves a one-off without one", async () => {
    const { id, seriesId } = await createRecurring(new Date(Date.now() + 2 * DAY_MS));
    expect(seriesId).toBe(id);

    const oneOff = await createDeadline(admin, user.userId, courseId);
    const { data } = await admin.from("deadlines").select("recurrence_series_id").eq("id", oneOff).single();
    expect(data?.recurrence_series_id).toBeNull();
  });

  it("completing early creates the next scheduled occurrence right away: same series, rule, and time, with a reminder", async () => {
    const due = new Date(Date.now() + 2 * DAY_MS);
    due.setUTCHours(22, 0, 0, 0);
    const { id, seriesId } = await createRecurring(due, { title: "Weekly quiz", priority: "High", recurrence_days: [dow(due), dow(new Date(due.getTime() + 3 * DAY_MS))] });

    await finish(id);

    const rows = await series(seriesId);
    expect(rows).toHaveLength(2);
    const next = rows[1];
    expect(next).toMatchObject({ title: "Weekly quiz", priority: "High", status: "Not Started", course_id: courseId });
    expect(new Date(next.due_at).getTime()).toBe(due.getTime() + 3 * DAY_MS);
    expect(next.recurrence_days).toEqual(rows[0].recurrence_days);

    const { data: reminder } = await admin.from("reminders").select("acknowledgment_state").eq("target_id", next.id).maybeSingle();
    expect(reminder?.acknowledgment_state).toBe("Scheduled");
  });

  it("when an occurrence comes due unfinished, the next one appears and they stack as separate deadlines", async () => {
    const { seriesId } = await createRecurring(new Date(Date.now() - 10 * DAY_MS));

    await sweepUntilStable(seriesId);

    const rows = await series(seriesId);
    expect(rows).toHaveLength(3); // -10d, -3d, +4d
    expect(rows.every((row) => row.status === "Not Started")).toBe(true);
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i].due_at).getTime() - new Date(rows[i - 1].due_at).getTime()).toBe(7 * DAY_MS);
    }
    expect(rows.filter((row) => new Date(row.due_at).getTime() > Date.now())).toHaveLength(1);

    // Only the future occurrence gets a reminder; ones that arrive already overdue don't.
    const { data: reminders } = await admin.from("reminders").select("target_id").in("target_id", rows.map((row) => row.id));
    expect(reminders?.map((r) => r.target_id)).toEqual([rows[2].id]);
  });

  it("completing an overdue occurrence late creates nothing new: its successor already exists", async () => {
    const { seriesId } = await createRecurring(new Date(Date.now() - 10 * DAY_MS));
    await sweepUntilStable(seriesId);
    const before = await series(seriesId);

    await finish(before[0].id);

    const after = await series(seriesId);
    expect(after).toHaveLength(before.length);
    expect(after[0].status).toBe("Completed");
    expect(after.slice(1).every((row) => row.status === "Not Started")).toBe(true);
  });

  it("cancelling just the latest occurrence continues the series with the next one", async () => {
    const { id, seriesId } = await createRecurring(new Date(Date.now() + 2 * DAY_MS));

    await walkTransitions(admin, "deadlines", id, "status", ["Cancelled"]);

    const rows = await series(seriesId);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("Cancelled");
    expect(rows[1].status).toBe("Not Started");
  });

  it("cancelling just an old occurrence leaves the stack alone", async () => {
    const { seriesId } = await createRecurring(new Date(Date.now() - 10 * DAY_MS));
    await sweepUntilStable(seriesId);
    const before = await series(seriesId);

    await walkTransitions(admin, "deadlines", before[0].id, "status", ["Cancelled"]);

    const after = await series(seriesId);
    expect(after).toHaveLength(before.length);
    expect(after.map((row) => row.status)).toEqual(["Cancelled", "Not Started", "Not Started"]);
  });

  it("cancel_deadline_series cancels every open occurrence, spares finished/submitted ones, and stops the series", async () => {
    const { seriesId } = await createRecurring(new Date(Date.now() - 17 * DAY_MS));
    await sweepUntilStable(seriesId);
    const stack = await series(seriesId); // -17d, -10d, -3d, +4d
    expect(stack).toHaveLength(4);
    await finish(stack[0].id);
    await walkTransitions(admin, "deadlines", stack[1].id, "status", ["In Progress", "Submitted"]);

    const { data: cancelled, error } = await user.client.rpc("cancel_deadline_series", { p_deadline_id: stack[3].id });
    expect(error).toBeNull();
    expect(cancelled).toBe(2); // -3d and +4d

    const rows = await series(seriesId);
    expect(rows.map((row) => row.status)).toEqual(["Completed", "Submitted", "Cancelled", "Cancelled"]);

    // Ending the series sticks: neither confirming the Submitted one nor a sweep revives it.
    await walkTransitions(admin, "deadlines", stack[1].id, "status", ["Completed"]);
    await admin.rpc("spawn_due_deadline_occurrences");
    expect(await series(seriesId)).toHaveLength(4);
  });

  it("cancel_deadline_series only touches the caller's own series", async () => {
    const { id, seriesId } = await createRecurring(new Date(Date.now() + 2 * DAY_MS));
    const other = await createAuthenticatedUser();

    const { data } = await other.client.rpc("cancel_deadline_series", { p_deadline_id: id });

    expect(data).toBe(0);
    expect((await series(seriesId))[0].status).toBe("Not Started");
  });

  it("stops creating occurrences once the next one would fall past the end date", async () => {
    const due = new Date(Date.now() + 2 * DAY_MS);
    const endDate = new Date(due.getTime() + 3 * DAY_MS).toISOString().slice(0, 10);
    const { id, seriesId } = await createRecurring(due, { recurrence_end_date: endDate });

    await finish(id);

    const rows = await series(seriesId);
    expect(rows).toHaveLength(1);
    expect(rows[0].recurrence_spawned_at).not.toBeNull();
  });

  it("keeps the local wall-clock time in the user's timezone across a DST change", async () => {
    const chicago = await createAuthenticatedUser();
    await admin.from("user_preferences").upsert({ user_id: chicago.userId, timezone: "America/Chicago" }, { onConflict: "user_id" });
    const course = await createCourse(admin, chicago.userId);
    // Fri 2026-10-30 17:00 CDT; the next Friday (11-06) is after DST ended.
    const id = await createDeadline(admin, chicago.userId, course, { due_at: "2026-10-30T22:00:00.000Z", recurrence_days: [5] });
    const { data: first } = await admin.from("deadlines").select("recurrence_series_id").eq("id", id).single();

    await finish(id);

    const { data: rows } = await admin.from("deadlines").select("due_at").eq("recurrence_series_id", first?.recurrence_series_id).order("due_at");
    expect(rows?.map((row) => new Date(row.due_at).toISOString())).toEqual(["2026-10-30T22:00:00.000Z", "2026-11-06T23:00:00.000Z"]);
  });

  it("the sweep ignores one-offs, finished, and soft-deleted occurrences", async () => {
    const past = new Date(Date.now() - 10 * DAY_MS);
    const oneOff = await createDeadline(admin, user.userId, courseId, { due_at: past.toISOString() });
    const deleted = await createRecurring(past);
    await admin.from("deadlines").update({ deleted_at: new Date().toISOString() }).eq("id", deleted.id);

    await admin.rpc("spawn_due_deadline_occurrences");

    const { count } = await admin.from("deadlines").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("recurrence_series_id", deleted.seriesId);
    expect(count).toBe(1);
    const { data } = await admin.from("deadlines").select("recurrence_series_id").eq("id", oneOff).single();
    expect(data?.recurrence_series_id).toBeNull();
  });

  it("rejects stored recurrence days outside 0-6", async () => {
    const { error } = await admin.from("deadlines").insert({
      user_id: user.userId,
      course_id: courseId,
      title: "Bad days",
      due_at: new Date().toISOString(),
      recurrence_days: [7],
    });
    expect(error?.message).toMatch(/deadlines_recurrence_days_valid/);
  });

  it("an invalid stored timezone falls back to UTC instead of breaking completion or the sweep", async () => {
    const odd = await createAuthenticatedUser();
    // user_preferences.timezone is only validated in the API layer, so a direct write can store anything.
    await admin.from("user_preferences").upsert({ user_id: odd.userId, timezone: "Not/AZone" }, { onConflict: "user_id" });
    const course = await createCourse(admin, odd.userId);
    const id = await createDeadline(admin, odd.userId, course, { due_at: "2030-03-15T17:00:00.000Z", recurrence_days: [5] });
    const { data: first } = await admin.from("deadlines").select("recurrence_series_id").eq("id", id).single();

    await finish(id); // would throw from the status trigger without the fallback

    const { data: rows } = await admin.from("deadlines").select("due_at").eq("recurrence_series_id", first?.recurrence_series_id).order("due_at");
    expect(rows?.map((row) => new Date(row.due_at).toISOString())).toEqual(["2030-03-15T17:00:00.000Z", "2030-03-22T17:00:00.000Z"]);
    const { error } = await admin.rpc("spawn_due_deadline_occurrences");
    expect(error).toBeNull();
  });

  it("never spawns a successor for a soft-deleted occurrence", async () => {
    const { id, seriesId } = await createRecurring(new Date(Date.now() + 2 * DAY_MS));
    await admin.from("deadlines").update({ deleted_at: new Date().toISOString() }).eq("id", id);

    const { data } = await admin.rpc("spawn_deadline_successor", { p_deadline_id: id });

    expect(data).toBeNull();
    expect(await series(seriesId)).toHaveLength(1);
  });

  it("cancel_deadline_series stamps the ended-series marker on every cancelled occurrence", async () => {
    const { id, seriesId } = await createRecurring(new Date(Date.now() - 10 * DAY_MS));
    await sweepUntilStable(seriesId);

    await user.client.rpc("cancel_deadline_series", { p_deadline_id: id });

    const rows = await series(seriesId);
    expect(rows.every((row) => row.status === "Cancelled" && row.recurrence_spawned_at !== null)).toBe(true);
  });
});
