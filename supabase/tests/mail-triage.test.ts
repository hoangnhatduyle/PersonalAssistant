// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createAuthenticatedUser, createMailAccount, createMailTriageItem, type TestUser } from "./helpers";

// Traces: supabase/migrations/0053_mail_triage.sql.
describe("mail triage — schema, RLS and guards", () => {
  const admin = adminClient();
  let alice: TestUser;
  let bob: TestUser;
  let aliceAccount: string;
  let bobAccount: string;

  beforeAll(async () => {
    alice = await createAuthenticatedUser();
    bob = await createAuthenticatedUser();
    aliceAccount = await createMailAccount(admin, alice.userId);
    bobAccount = await createMailAccount(admin, bob.userId);
  });

  describe("mail_triage_items", () => {
    it("isolates items between users (RLS select)", async () => {
      const id = await createMailTriageItem(admin, alice.userId, aliceAccount);
      const { data: own } = await alice.client.from("mail_triage_items").select("id").eq("id", id);
      expect(own).toHaveLength(1);
      const { data: other } = await bob.client.from("mail_triage_items").select("id").eq("id", id);
      expect(other ?? []).toHaveLength(0);
    });

    it("lets a user insert their own item but not one for another user", async () => {
      const own = await alice.client.from("mail_triage_items").insert({
        user_id: alice.userId,
        mail_account_id: aliceAccount,
        provider: "google",
        provider_message_id: `msg-${randomUUID()}`,
        subject: "s",
        sender: "x",
        received_at: new Date().toISOString(),
        bucket: "fyi",
        reason: "r",
      });
      expect(own.error).toBeNull();

      const spoof = await bob.client.from("mail_triage_items").insert({
        user_id: alice.userId,
        mail_account_id: aliceAccount,
        provider: "google",
        provider_message_id: `msg-${randomUUID()}`,
        subject: "s",
        sender: "x",
        received_at: new Date().toISOString(),
        bucket: "fyi",
        reason: "r",
      });
      expect(spoof.error).not.toBeNull();
    });

    it("rejects an item that points at another user's mailbox (composite FK)", async () => {
      const { error } = await admin.from("mail_triage_items").insert({
        user_id: alice.userId,
        mail_account_id: bobAccount,
        provider: "google",
        provider_message_id: `msg-${randomUUID()}`,
        subject: "s",
        sender: "x",
        received_at: new Date().toISOString(),
        bucket: "fyi",
        reason: "r",
      });
      expect(error).not.toBeNull();
    });

    it("lets a user update only their own item's status", async () => {
      const id = await createMailTriageItem(admin, alice.userId, aliceAccount);
      const mine = await alice.client.from("mail_triage_items").update({ status: "dismissed" }).eq("id", id).select("id");
      expect(mine.data).toHaveLength(1);

      const theirs = await bob.client.from("mail_triage_items").update({ status: "acted" }).eq("id", id).select("id");
      expect(theirs.data ?? []).toHaveLength(0);
      const { data } = await admin.from("mail_triage_items").select("status").eq("id", id).single();
      expect(data?.status).toBe("dismissed");
    });

    it("has no client hard delete (no DELETE policy)", async () => {
      const id = await createMailTriageItem(admin, alice.userId, aliceAccount);
      await alice.client.from("mail_triage_items").delete().eq("id", id);
      const { data } = await admin.from("mail_triage_items").select("id").eq("id", id);
      expect(data ?? []).toHaveLength(1);
    });

    it("enforces the bucket, status and provider checks", async () => {
      const bad = async (row: Record<string, unknown>) =>
        (
          await admin.from("mail_triage_items").insert({
            user_id: alice.userId,
            mail_account_id: aliceAccount,
            provider: "google",
            provider_message_id: `msg-${randomUUID()}`,
            subject: "s",
            sender: "x",
            received_at: new Date().toISOString(),
            bucket: "fyi",
            reason: "r",
            ...row,
          })
        ).error;
      expect(await bad({ bucket: "urgent" })).not.toBeNull();
      expect(await bad({ status: "snoozed" })).not.toBeNull();
      expect(await bad({ provider: "yahoo" })).not.toBeNull();
      expect(await bad({ bucket: "ignore", status: "acted" })).toBeNull();
    });

    it("is unique per mailbox + provider message id", async () => {
      const messageId = `msg-${randomUUID()}`;
      await createMailTriageItem(admin, alice.userId, aliceAccount, { provider_message_id: messageId });
      await expect(createMailTriageItem(admin, alice.userId, aliceAccount, { provider_message_id: messageId })).rejects.toThrow();
    });

    it("defaults to open status and a 14-day expiry", async () => {
      const id = await createMailTriageItem(admin, alice.userId, aliceAccount);
      const { data } = await admin.from("mail_triage_items").select("status, triaged_at, expires_at").eq("id", id).single();
      expect(data?.status).toBe("open");
      const days = (new Date(data!.expires_at).getTime() - new Date(data!.triaged_at).getTime()) / 86_400_000;
      expect(Math.round(days)).toBe(14);
    });

    it("deletes a mailbox's triage items when the mailbox is disconnected (cascade)", async () => {
      const account = await createMailAccount(admin, alice.userId, { provider: "microsoft" });
      const id = await createMailTriageItem(admin, alice.userId, account, { provider: "microsoft" });
      await alice.client.from("mail_accounts").delete().eq("id", account);
      const { data } = await admin.from("mail_triage_items").select("id").eq("id", id);
      expect(data ?? []).toHaveLength(0);
    });

    it("delete_expired_mail_triage_items removes only expired rows and is service_role only", async () => {
      const fresh = await createMailTriageItem(admin, alice.userId, aliceAccount);
      const stale = await createMailTriageItem(admin, alice.userId, aliceAccount, {
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });

      const asUser = await alice.client.rpc("delete_expired_mail_triage_items");
      expect(asUser.error).not.toBeNull();

      const { error } = await admin.rpc("delete_expired_mail_triage_items");
      expect(error).toBeNull();
      const { data } = await admin.from("mail_triage_items").select("id").in("id", [fresh, stale]);
      expect((data ?? []).map((row) => row.id)).toEqual([fresh]);
    });
  });

  describe("mail_triage_runs (rate-limit table)", () => {
    it("lets a user append and read their own runs, but not another user's, update, or delete", async () => {
      const insert = await alice.client.from("mail_triage_runs").insert({ user_id: alice.userId, provider: "google" });
      expect(insert.error).toBeNull();

      const spoof = await bob.client.from("mail_triage_runs").insert({ user_id: alice.userId, provider: "google" });
      expect(spoof.error).not.toBeNull();

      const { data: seenByBob } = await bob.client.from("mail_triage_runs").select("id").eq("user_id", alice.userId);
      expect(seenByBob ?? []).toHaveLength(0);

      const { data: mine } = await alice.client.from("mail_triage_runs").select("id").eq("user_id", alice.userId);
      expect((mine ?? []).length).toBeGreaterThan(0);

      const update = await alice.client.from("mail_triage_runs").update({ provider: "microsoft" }).eq("user_id", alice.userId);
      expect(update.error).not.toBeNull();
      const del = await alice.client.from("mail_triage_runs").delete().eq("user_id", alice.userId);
      expect(del.error).not.toBeNull();
    });

    it("counts runs inside the rate-limit window through the real limiter", async () => {
      const { checkTriageRateLimit } = await import("@/lib/email-triage/rate-limit");
      const user = await createAuthenticatedUser();
      const client = user.client as never;
      for (let run = 0; run < 6; run += 1) {
        expect((await checkTriageRateLimit(client, user.userId, "google")).allowed).toBe(true);
      }
      expect((await checkTriageRateLimit(client, user.userId, "microsoft")).allowed).toBe(false);
    });
  });
});
