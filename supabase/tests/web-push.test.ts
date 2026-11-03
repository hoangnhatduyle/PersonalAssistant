import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createReminder, createTask, walkTransitions, type TestUser } from "./helpers";

// 0057_web_push.sql: push_subscriptions (owner-scoped RLS, globally unique
// endpoint) and reminders.pushed_at. Also pins the RLS-conflict behavior that
// POST /api/push/subscribe turns into a 409 (see the comment on that route).
describe("web push", () => {
  const admin = adminClient();
  let userA: TestUser;
  let userB: TestUser;

  const subscriptionRow = (userId: string, overrides: Record<string, unknown> = {}) => ({
    user_id: userId,
    endpoint: `https://push.example.com/${randomUUID()}`,
    p256dh: "p256dh-key",
    auth: "auth-secret",
    ...overrides,
  });

  beforeAll(async () => {
    userA = await createAuthenticatedUser();
    userB = await createAuthenticatedUser();
  });

  describe("push_subscriptions RLS", () => {
    it("lets a user register, read and delete their own subscription", async () => {
      const row = subscriptionRow(userA.userId);
      const insert = await userA.client.from("push_subscriptions").insert(row).select("id").single();
      expect(insert.error).toBeNull();

      const read = await userA.client.from("push_subscriptions").select("endpoint").eq("endpoint", row.endpoint);
      expect(read.data).toEqual([{ endpoint: row.endpoint }]);

      const del = await userA.client.from("push_subscriptions").delete().eq("endpoint", row.endpoint).select("id");
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
    });

    it("hides one user's subscriptions from another", async () => {
      const row = subscriptionRow(userA.userId);
      await admin.from("push_subscriptions").insert(row);

      const read = await userB.client.from("push_subscriptions").select("id").eq("endpoint", row.endpoint);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
    });

    it("refuses to register a subscription on someone else's behalf", async () => {
      const { error } = await userB.client.from("push_subscriptions").insert(subscriptionRow(userA.userId));
      expect(error).not.toBeNull();
    });

    it("does not let one user delete another's subscription (RLS matches zero rows)", async () => {
      const row = subscriptionRow(userA.userId);
      await admin.from("push_subscriptions").insert(row);

      const del = await userB.client.from("push_subscriptions").delete().eq("endpoint", row.endpoint).select("id");
      expect(del.data).toEqual([]);
      const still = await admin.from("push_subscriptions").select("id").eq("endpoint", row.endpoint);
      expect(still.data).toHaveLength(1);
    });
  });

  describe("endpoint uniqueness", () => {
    it("lets the same user re-subscribe an endpoint (upsert refreshes the keys)", async () => {
      const row = subscriptionRow(userA.userId);
      await userA.client.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
      const again = await userA.client.from("push_subscriptions").upsert({ ...row, p256dh: "rotated" }, { onConflict: "endpoint" });
      expect(again.error).toBeNull();

      const read = await admin.from("push_subscriptions").select("p256dh").eq("endpoint", row.endpoint);
      expect(read.data).toEqual([{ p256dh: "rotated" }]);
    });

    it("rejects, with an RLS error (42501), a second account claiming an endpoint another account holds", async () => {
      const row = subscriptionRow(userA.userId);
      await admin.from("push_subscriptions").insert(row);

      const { error } = await userB.client.from("push_subscriptions").upsert({ ...row, user_id: userB.userId }, { onConflict: "endpoint" });
      expect(error?.code).toBe("42501");

      const owner = await admin.from("push_subscriptions").select("user_id").eq("endpoint", row.endpoint);
      expect(owner.data).toEqual([{ user_id: userA.userId }]);
    });
  });

  describe("reminders.pushed_at", () => {
    async function deliveredReminder(userId: string): Promise<string> {
      const taskId = await createTask(admin, userId, { due_at: new Date(Date.now() + 3_600_000).toISOString() });
      const reminderId = await createReminder(admin, userId, "task", taskId, { trigger_at: new Date(Date.now() - 60_000).toISOString() });
      await walkTransitions(admin, "reminders", reminderId, "acknowledgment_state", ["Delivered"]);
      return reminderId;
    }

    it("a Delivered reminder with pushed_at IS NULL is a push candidate, independent of emailed_at", async () => {
      const reminderId = await deliveredReminder(userA.userId);
      // Emailed already -- must not hide it from the push channel.
      await admin.from("reminders").update({ emailed_at: new Date().toISOString() }).eq("id", reminderId);

      const { data } = await admin.from("reminders").select("id").eq("acknowledgment_state", "Delivered").is("pushed_at", null).eq("id", reminderId);
      expect(data).toHaveLength(1);
    });

    it("a second claim attempt on an already-claimed row affects 0 rows (concurrency guard)", async () => {
      const reminderId = await deliveredReminder(userA.userId);
      const claim = () =>
        admin.from("reminders").update({ pushed_at: new Date().toISOString() }).eq("id", reminderId).is("pushed_at", null).select("id").maybeSingle();

      expect((await claim()).data).not.toBeNull();
      expect((await claim()).data).toBeNull();
    });

    it("reverting the claim makes the reminder a candidate again (failed-send compensation)", async () => {
      const reminderId = await deliveredReminder(userA.userId);
      await admin.from("reminders").update({ pushed_at: new Date().toISOString() }).eq("id", reminderId);
      await admin.from("reminders").update({ pushed_at: null }).eq("id", reminderId);

      const { data } = await admin.from("reminders").select("id").eq("acknowledgment_state", "Delivered").is("pushed_at", null).eq("id", reminderId);
      expect(data).toHaveLength(1);
    });
  });
});
