import { describe, expect, it } from "vitest";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { createAuthenticatedUser } from "../../../../supabase/tests/helpers";
import { getAuthenticatedUser } from "../server";

// Traces: SPEC-API-004 NC-API-001 — the app layer must verify the
// authenticated user itself, never trust RLS (or a cookie payload) alone.
describe("getAuthenticatedUser", () => {
  it("resolves the real signed-in user for an authenticated client", async () => {
    const user = await createAuthenticatedUser();

    const resolved = await getAuthenticatedUser(user.client);

    expect(resolved?.id).toBe(user.userId);
    expect(resolved?.email).toBe(user.email);
  });

  it("returns null for a client with no session, rather than guessing an identity", async () => {
    const anonClient = createRawClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const resolved = await getAuthenticatedUser(anonClient);

    expect(resolved).toBeNull();
  });
});
