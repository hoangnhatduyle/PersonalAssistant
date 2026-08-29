import { describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createVoiceSession, walkTransitions } from "./helpers";

// Traces: SPEC-DATA-007 AC-9, NC-DATA-009.
describe("voice_sessions retention sweep", () => {
  const admin = adminClient();

  it("AC-9: hard-deletes a session more than 24h past its ended_at", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId, {
      transcript: "delete my CS101 course",
      ended_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
    });

    const { error: rpcError } = await admin.rpc("delete_expired_voice_sessions");
    expect(rpcError).toBeNull();

    const { data } = await admin.from("voice_sessions").select("id").eq("id", id).maybeSingle();
    expect(data).toBeNull();
  });

  it("AC-9: falls back to started_at when a session never reached a terminal state", async () => {
    const user = await createAuthenticatedUser();
    // started_at defaults to now() on insert, so back-date it directly.
    const id = await createVoiceSession(admin, user.userId);
    await walkTransitions(admin, "voice_sessions", id, "state", ["Listening"]);
    await admin
      .from("voice_sessions")
      .update({ started_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString() })
      .eq("id", id);

    const { error: rpcError } = await admin.rpc("delete_expired_voice_sessions");
    expect(rpcError).toBeNull();

    const { data } = await admin.from("voice_sessions").select("id").eq("id", id).maybeSingle();
    expect(data).toBeNull();
  });

  it("does not delete a session within its 24h window", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId, {
      ended_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const { error: rpcError } = await admin.rpc("delete_expired_voice_sessions");
    expect(rpcError).toBeNull();

    const { data } = await admin.from("voice_sessions").select("id").eq("id", id).maybeSingle();
    expect(data).not.toBeNull();
  });

  it("NC-DATA-009: denies delete_expired_voice_sessions to a non-service caller", async () => {
    const user = await createAuthenticatedUser();
    const { error } = await user.client.rpc("delete_expired_voice_sessions");
    expect(error).not.toBeNull();
  });
});
