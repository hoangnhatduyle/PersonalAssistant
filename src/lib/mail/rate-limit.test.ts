import { describe, expect, it, vi } from "vitest";
import { checkMailApiRateLimit } from "./rate-limit";

function fakeSupabase(count: number) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: async () => ({ count, error: null }),
          }),
        }),
      }),
      insert,
    }),
  } as never;
  return { supabase, insert };
}

describe("checkMailApiRateLimit", () => {
  it("allows the request and records it when under the limit", async () => {
    const { supabase, insert } = fakeSupabase(0);
    const result = await checkMailApiRateLimit(supabase, "user-1", "google");
    expect(result.allowed).toBe(true);
    expect(insert).toHaveBeenCalledWith({ user_id: "user-1", provider: "google" });
  });

  it("denies the request without inserting once at the limit", async () => {
    const { supabase, insert } = fakeSupabase(30);
    const result = await checkMailApiRateLimit(supabase, "user-1", "google");
    expect(result.allowed).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
