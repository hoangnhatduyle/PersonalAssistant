import { describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createVoiceSession, walkTransitions } from "./helpers";

// Traces: architect-review finding on Item 5 — trg_guard_voice_session_state
// was originally declared `before update of state`, so an UPDATE that never
// touches `state` never fired it at all, letting an authenticated user's own
// client tamper with pending_mutation/expires_at directly via PostgREST
// without ever going through this app's own confirm/decline routes.
// supabase/migrations/0005_voice_session_column_lockdown.sql widens the
// trigger to also cover those two columns.
describe("voice_sessions column lockdown (0005)", () => {
  const admin = adminClient();

  it("rejects an authenticated user's own client changing pending_mutation without a state change", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);
    await walkTransitions(admin, "voice_sessions", id, "state", ["Listening", "Transcribing", "IntentResolved"]);
    await admin
      .from("voice_sessions")
      .update({ state: "AwaitingConfirmation", pending_mutation: { action: "noop" }, expires_at: new Date(Date.now() + 60_000).toISOString() })
      .eq("id", id);

    const { error } = await user.client.from("voice_sessions").update({ pending_mutation: { action: "tampered" } }).eq("id", id);
    expect(error).not.toBeNull();

    const { data } = await admin.from("voice_sessions").select("pending_mutation").eq("id", id).single();
    expect(data?.pending_mutation).toEqual({ action: "noop" });
  });

  it("rejects an authenticated user's own client extending expires_at without a state change", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);
    await walkTransitions(admin, "voice_sessions", id, "state", ["Listening", "Transcribing", "IntentResolved"]);
    const originalExpiry = new Date(Date.now() + 60_000).toISOString();
    await admin
      .from("voice_sessions")
      .update({ state: "AwaitingConfirmation", pending_mutation: { action: "noop" }, expires_at: originalExpiry })
      .eq("id", id);

    const farFuture = new Date(Date.now() + 999 * 60_000).toISOString();
    const { error } = await user.client.from("voice_sessions").update({ expires_at: farFuture }).eq("id", id);
    expect(error).not.toBeNull();

    const { data } = await admin.from("voice_sessions").select("expires_at").eq("id", id).single();
    expect(new Date(data!.expires_at as string).getTime()).toBe(new Date(originalExpiry).getTime());
  });

  it("still allows pending_mutation/expires_at to change together with a real state transition", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);
    await walkTransitions(admin, "voice_sessions", id, "state", ["Listening", "Transcribing", "IntentResolved"]);

    const { error } = await user.client
      .from("voice_sessions")
      .update({ state: "AwaitingConfirmation", pending_mutation: { action: "noop" }, expires_at: new Date(Date.now() + 60_000).toISOString() })
      .eq("id", id);
    expect(error).toBeNull();
  });

  it("still allows service_role (test/system setup) to write these columns directly, matching existing test conventions", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);
    await walkTransitions(admin, "voice_sessions", id, "state", ["Listening", "Transcribing", "IntentResolved"]);
    await admin
      .from("voice_sessions")
      .update({ state: "AwaitingConfirmation", pending_mutation: { action: "noop" }, expires_at: new Date(Date.now() + 60_000).toISOString() })
      .eq("id", id);

    // supabase/tests/voice-sessions.test.ts's own expiry-simulation pattern:
    // backdating expires_at via the service-role admin client with no state
    // change, to simulate time having passed without needing a fake clock.
    const { error } = await admin.from("voice_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    expect(error).toBeNull();
  });
});
