import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, type TestUser } from "./helpers";

// 0058_voice_realtime_calls.sql: the server-owned record behind the voice call
// caps. What matters is that a client can neither rewrite nor remove its own
// rows, and that the end time is the server's clock capped at 300 s.
describe("voice_realtime_calls", () => {
  const admin = adminClient();
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    userA = await createAuthenticatedUser();
    userB = await createAuthenticatedUser();
  });

  async function startCall(user: TestUser): Promise<string> {
    const { data, error } = await user.client.from("voice_realtime_calls").insert({ user_id: user.userId }).select("id").single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  describe("row level security", () => {
    it("lets a user start and read their own calls", async () => {
      const id = await startCall(userA);
      const { data } = await userA.client.from("voice_realtime_calls").select("id, ended_at, ended_reason").eq("id", id).single();
      expect(data).toEqual({ id, ended_at: null, ended_reason: null });
    });

    it("hides one user's calls from another", async () => {
      const id = await startCall(userA);
      const { data } = await userB.client.from("voice_realtime_calls").select("id").eq("id", id);
      expect(data).toEqual([]);
    });

    it("refuses to start a call on someone else's behalf", async () => {
      const { error } = await userB.client.from("voice_realtime_calls").insert({ user_id: userA.userId });
      expect(error).not.toBeNull();
    });

    it("does not let a client rewrite a call's times (update is revoked)", async () => {
      const id = await startCall(userA);
      const { error } = await userA.client.from("voice_realtime_calls").update({ ended_at: new Date().toISOString(), ended_reason: "user" }).eq("id", id);
      expect(error).not.toBeNull();
      const { data } = await admin.from("voice_realtime_calls").select("ended_at").eq("id", id).single();
      expect(data!.ended_at).toBeNull();
    });

    it("does not let a client delete a call", async () => {
      const id = await startCall(userA);
      const { error } = await userA.client.from("voice_realtime_calls").delete().eq("id", id);
      expect(error).not.toBeNull();
      const { data } = await admin.from("voice_realtime_calls").select("id").eq("id", id);
      expect(data).toHaveLength(1);
    });
  });

  describe("end_voice_realtime_call", () => {
    it("ends the caller's open call at the server's time, with the reason given", async () => {
      const id = await startCall(userA);
      const before = Date.now();
      const { data, error } = await userA.client.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "idle" });
      expect(error).toBeNull();
      expect(new Date(data as string).getTime()).toBeGreaterThanOrEqual(before - 5000);

      const { data: row } = await admin.from("voice_realtime_calls").select("ended_at, ended_reason").eq("id", id).single();
      expect(row!.ended_reason).toBe("idle");
      expect(row!.ended_at).not.toBeNull();
    });

    it("defaults the reason to user", async () => {
      const id = await startCall(userA);
      await userA.client.rpc("end_voice_realtime_call", { p_call_id: id });
      const { data: row } = await admin.from("voice_realtime_calls").select("ended_reason").eq("id", id).single();
      expect(row!.ended_reason).toBe("user");
    });

    it("caps the recorded length at 300 seconds, however late the end is reported", async () => {
      const id = await startCall(userA);
      // Make the call look 20 minutes old (service role only; clients cannot touch started_at).
      const startedAt = new Date(Date.now() - 20 * 60_000).toISOString();
      await admin.from("voice_realtime_calls").update({ started_at: startedAt }).eq("id", id);

      await userA.client.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "user" });
      const { data: row } = await admin.from("voice_realtime_calls").select("started_at, ended_at").eq("id", id).single();
      const seconds = (new Date(row!.ended_at as string).getTime() - new Date(row!.started_at as string).getTime()) / 1000;
      expect(seconds).toBe(300);
    });

    it("is harmless to repeat: the second call changes nothing and returns null", async () => {
      const id = await startCall(userA);
      await userA.client.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "user" });
      const first = await admin.from("voice_realtime_calls").select("ended_at").eq("id", id).single();

      const { data } = await userA.client.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "cap" });
      expect(data).toBeNull();
      const second = await admin.from("voice_realtime_calls").select("ended_at, ended_reason").eq("id", id).single();
      expect(second.data).toEqual({ ended_at: first.data!.ended_at, ended_reason: "user" });
    });

    it("cannot end another user's call", async () => {
      const id = await startCall(userA);
      const { data } = await userB.client.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "user" });
      expect(data).toBeNull();
      const { data: row } = await admin.from("voice_realtime_calls").select("ended_at").eq("id", id).single();
      expect(row!.ended_at).toBeNull();
    });

    it("rejects a reason outside the allowed set", async () => {
      const id = await startCall(userA);
      const { error } = await userA.client.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "because" });
      expect(error).not.toBeNull();
    });

    it("is not callable without signing in", async () => {
      const id = await startCall(userA);
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { error } = await anon.rpc("end_voice_realtime_call", { p_call_id: id, p_reason: "user" });
      expect(error).not.toBeNull();
    });
  });

  describe("close_open_voice_realtime_calls", () => {
    it("closes only the caller's open calls, as superseded", async () => {
      const mine = await startCall(userA);
      const theirs = await startCall(userB);
      await userA.client.rpc("close_open_voice_realtime_calls");

      const { data: a } = await admin.from("voice_realtime_calls").select("ended_at, ended_reason").eq("id", mine).single();
      expect(a).toMatchObject({ ended_reason: "superseded" });
      expect(a!.ended_at).not.toBeNull();
      const { data: b } = await admin.from("voice_realtime_calls").select("ended_at").eq("id", theirs).single();
      expect(b!.ended_at).toBeNull();
    });
  });

  describe("constraints", () => {
    it("requires an end time and a reason to be set together", async () => {
      const id = await startCall(userA);
      const noReason = await admin.from("voice_realtime_calls").update({ ended_at: new Date().toISOString() }).eq("id", id);
      expect(noReason.error).not.toBeNull();
    });
  });
});
