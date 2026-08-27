import { describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createVoiceSession, walkTransitions } from "./helpers";

// Traces: SPEC-DATA-006 AC-4.
describe("voice_sessions confirmation window", () => {
  const admin = adminClient();

  it("makes pending_mutation readable from a separate request before expires_at", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);

    const pendingMutation = { action: "delete_course", course_id: "00000000-0000-0000-0000-000000000000" };
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

    await walkTransitions(admin, "voice_sessions", id, "state", [
      "Listening",
      "Transcribing",
      "IntentResolved",
    ]);
    const { error } = await admin
      .from("voice_sessions")
      .update({ state: "AwaitingConfirmation", pending_mutation: pendingMutation, expires_at: expiresAt })
      .eq("id", id);
    expect(error).toBeNull();

    // Simulate a second, separate HTTP request: a fresh client reading by id.
    const secondRequestClient = adminClient();
    const { data, error: readError } = await secondRequestClient
      .from("voice_sessions")
      .select("state, pending_mutation, expires_at")
      .eq("id", id)
      .single();

    expect(readError).toBeNull();
    expect(data?.state).toBe("AwaitingConfirmation");
    expect(new Date(data!.expires_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(data?.pending_mutation).toEqual(pendingMutation);
  });

  // Traces: SPEC-VOICE-004 NC-VOICE-005.
  it("rejects AwaitingConfirmation -> Executing once expires_at has passed", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);

    await walkTransitions(admin, "voice_sessions", id, "state", [
      "Listening",
      "Transcribing",
      "IntentResolved",
    ]);
    await admin
      .from("voice_sessions")
      .update({
        state: "AwaitingConfirmation",
        pending_mutation: { action: "noop" },
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq("id", id);

    const { error } = await admin.from("voice_sessions").update({ state: "Executing" }).eq("id", id);
    expect(error).not.toBeNull();
  });

  it("rejects AwaitingConfirmation with a null expires_at outright (CHECK constraint)", async () => {
    const user = await createAuthenticatedUser();
    const id = await createVoiceSession(admin, user.userId);

    await walkTransitions(admin, "voice_sessions", id, "state", [
      "Listening",
      "Transcribing",
      "IntentResolved",
    ]);
    const { error } = await admin
      .from("voice_sessions")
      .update({ state: "AwaitingConfirmation", pending_mutation: { action: "noop" } })
      .eq("id", id);
    expect(error).not.toBeNull();
  });
});
