import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createVoiceSession, walkTransitions, type TestUser } from "../../../../../supabase/tests/helpers";
import { createCallToolPorts } from "../tool-executor";

// Runs against the local Supabase stack: the mocked ports in tool-executor.test.ts
// cannot notice a query naming a column that does not exist.
describe("createCallToolPorts.listAwaitingSessions", () => {
  const admin = adminClient();
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
  });

  it("returns the user's awaiting-confirmation sessions, newest first, and ignores other states", async () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    const awaiting = { state: "AwaitingConfirmation", pending_mutation: { action: "noop" }, expires_at: soon };
    const older = await createVoiceSession(admin, user.userId, { started_at: new Date(Date.now() - 120_000).toISOString() });
    const newer = await createVoiceSession(admin, user.userId);
    await createVoiceSession(admin, user.userId);
    for (const id of [older, newer]) {
      await walkTransitions(admin, "voice_sessions", id, "state", ["Listening", "Transcribing", "IntentResolved"]);
      const { error } = await admin.from("voice_sessions").update(awaiting).eq("id", id);
      expect(error).toBeNull();
    }

    const sessions = await createCallToolPorts(user.client, user.userId).listAwaitingSessions();

    expect(sessions.map((session) => session.id)).toEqual([newer, older]);
  });
});
