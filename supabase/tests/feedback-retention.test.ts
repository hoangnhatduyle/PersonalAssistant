import { describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createFeedback,
  createTask,
  type TestUser,
} from "./helpers";

const DAYS_181_AGO = new Date(Date.now() - 181 * 24 * 60 * 60_000).toISOString();
const DAYS_1_AGO = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

async function seedDeadline(admin: ReturnType<typeof adminClient>, user: TestUser): Promise<string> {
  const courseId = await createCourse(admin, user.userId);
  return createDeadline(admin, user.userId, courseId);
}

// Traces: SPEC-DATA-010 AC-11, AC-12, NC-DATA-010, NC-DATA-011.
describe("feedback retention sweep", () => {
  const admin = adminClient();

  it("AC-11: aggregates and hard-deletes rows older than 180 days, grouped by (user_id, target_type)", async () => {
    const user = await createAuthenticatedUser();
    const deadlineId = await seedDeadline(admin, user);
    await createFeedback(admin, user.userId, "deadline", deadlineId, { rating: 5, created_at: DAYS_181_AGO });
    await createFeedback(admin, user.userId, "deadline", deadlineId, { rating: 3, created_at: DAYS_181_AGO });

    const { error: rpcError } = await admin.rpc("sweep_expired_feedback");
    expect(rpcError).toBeNull();

    const { data: remaining } = await admin.from("feedback").select("id").eq("user_id", user.userId);
    expect(remaining ?? []).toHaveLength(0);

    const { data: agg } = await admin
      .from("feedback_aggregates")
      .select("sample_count, rating_sum, avg_rating, updated_at")
      .eq("user_id", user.userId)
      .eq("dimension", "deadline")
      .single();
    expect(agg?.sample_count).toBe(2);
    expect(agg?.rating_sum).toBe(8);
    expect(Number(agg?.avg_rating)).toBe(4);
    expect(agg?.updated_at).not.toBeNull();
  });

  it("AC-11: a second sweep run advances updated_at and accumulates onto the existing aggregate", async () => {
    const user = await createAuthenticatedUser();
    const deadlineId = await seedDeadline(admin, user);
    await createFeedback(admin, user.userId, "deadline", deadlineId, { rating: 5, created_at: DAYS_181_AGO });
    await admin.rpc("sweep_expired_feedback");
    const { data: firstPass } = await admin
      .from("feedback_aggregates")
      .select("sample_count, rating_sum, updated_at")
      .eq("user_id", user.userId)
      .eq("dimension", "deadline")
      .single();

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await createFeedback(admin, user.userId, "deadline", deadlineId, { rating: 1, created_at: DAYS_181_AGO });
    await admin.rpc("sweep_expired_feedback");
    const { data: secondPass } = await admin
      .from("feedback_aggregates")
      .select("sample_count, rating_sum, updated_at")
      .eq("user_id", user.userId)
      .eq("dimension", "deadline")
      .single();

    expect(secondPass?.sample_count).toBe((firstPass?.sample_count ?? 0) + 1);
    expect(secondPass?.rating_sum).toBe((firstPass?.rating_sum ?? 0) + 1);
    expect(new Date(secondPass!.updated_at as string).getTime()).toBeGreaterThan(
      new Date(firstPass!.updated_at as string).getTime(),
    );
  });

  it("does not touch a feedback row within the 180-day window", async () => {
    const user = await createAuthenticatedUser();
    const taskId = await createTask(admin, user.userId);
    const id = await createFeedback(admin, user.userId, "task", taskId, { rating: 4, created_at: DAYS_1_AGO });

    const { error: rpcError } = await admin.rpc("sweep_expired_feedback");
    expect(rpcError).toBeNull();

    const { data } = await admin.from("feedback").select("id").eq("id", id).maybeSingle();
    expect(data).not.toBeNull();
  });

  it("NC-DATA-010: two concurrent sweep runs against the same expired rows do not double-count", async () => {
    const user = await createAuthenticatedUser();
    const deadlineId = await seedDeadline(admin, user);
    const ratings = [5, 3, 4];
    for (const rating of ratings) {
      await createFeedback(admin, user.userId, "deadline", deadlineId, { rating, created_at: DAYS_181_AGO });
    }

    const [first, second] = await Promise.all([
      admin.rpc("sweep_expired_feedback"),
      admin.rpc("sweep_expired_feedback"),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const { data: agg } = await admin
      .from("feedback_aggregates")
      .select("sample_count, rating_sum")
      .eq("user_id", user.userId)
      .eq("dimension", "deadline")
      .single();
    expect(agg?.sample_count).toBe(3);
    expect(agg?.rating_sum).toBe(12);

    const { data: remaining } = await admin.from("feedback").select("id").eq("user_id", user.userId);
    expect(remaining ?? []).toHaveLength(0);
  });

  it("NC-DATA-012: denies sweep_expired_feedback to a non-service caller", async () => {
    const user = await createAuthenticatedUser();
    const { error } = await user.client.rpc("sweep_expired_feedback");
    expect(error).not.toBeNull();
  });
});

// Traces: SPEC-DATA-010 AC-12, NC-DATA-011.
describe("feedback user-initiated delete", () => {
  const admin = adminClient();

  it("AC-12: the owning user can hard-delete their own feedback row immediately", async () => {
    const user = await createAuthenticatedUser();
    const deadlineId = await seedDeadline(admin, user);
    const id = await createFeedback(admin, user.userId, "deadline", deadlineId, { rating: 4 });

    const { error } = await user.client.from("feedback").delete().eq("id", id);
    expect(error).toBeNull();

    const { data } = await admin.from("feedback").select("id").eq("id", id).maybeSingle();
    expect(data).toBeNull();
  });

  it("AC-12: a user cannot delete another user's feedback row", async () => {
    const userA = await createAuthenticatedUser();
    const userB = await createAuthenticatedUser();
    const deadlineId = await seedDeadline(admin, userA);
    const id = await createFeedback(admin, userA.userId, "deadline", deadlineId, { rating: 4 });

    const { error, count } = await userB.client.from("feedback").delete({ count: "exact" }).eq("id", id);
    expect(error).toBeNull();
    expect(count).toBe(0);

    const { data } = await admin.from("feedback").select("id").eq("id", id).maybeSingle();
    expect(data).not.toBeNull();
  });

  it("NC-DATA-011: a user-initiated delete does not write anything to feedback_aggregates", async () => {
    const user = await createAuthenticatedUser();
    const deadlineId = await seedDeadline(admin, user);
    const id = await createFeedback(admin, user.userId, "deadline", deadlineId, { rating: 4 });

    await user.client.from("feedback").delete().eq("id", id);

    const { data } = await admin
      .from("feedback_aggregates")
      .select("id")
      .eq("user_id", user.userId)
      .eq("dimension", "deadline")
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("NC-DATA-012: feedback_aggregates rejects a direct write from the owning user", async () => {
    const user = await createAuthenticatedUser();
    const { error } = await user.client
      .from("feedback_aggregates")
      .insert({ user_id: user.userId, dimension: "deadline", sample_count: 999, rating_sum: 999 });
    expect(error).not.toBeNull();
  });
});
