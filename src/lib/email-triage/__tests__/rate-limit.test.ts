import { describe, expect, it, vi } from "vitest";
import { checkTriageRateLimit } from "@/lib/email-triage/rate-limit";

function fakeSupabase(count: number) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const table = vi.fn();
  const supabase = {
    from: (name: string) => {
      table(name);
      return {
        select: () => ({ eq: () => ({ gte: async () => ({ count, error: null }) }) }),
        insert,
      };
    },
  } as never;
  return { supabase, insert, table };
}

describe("checkTriageRateLimit", () => {
  it("allows a run and records it in mail_triage_runs (not mail_api_requests) when under the limit", async () => {
    const { supabase, insert, table } = fakeSupabase(5);
    const result = await checkTriageRateLimit(supabase, "user-1", "microsoft");

    expect(result.allowed).toBe(true);
    expect(insert).toHaveBeenCalledWith({ user_id: "user-1", provider: "microsoft" });
    expect(new Set(table.mock.calls.map(([name]) => name))).toEqual(new Set(["mail_triage_runs"]));
  });

  it("denies the 7th run in the hour without inserting", async () => {
    const { supabase, insert } = fakeSupabase(6);
    const result = await checkTriageRateLimit(supabase, "user-1", "google");

    expect(result.allowed).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws when the count query fails, so the run does not proceed unmetered", async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count: null, error: new Error("db") }) }) }) }),
    } as never;
    await expect(checkTriageRateLimit(supabase, "user-1", "google")).rejects.toThrow("db");
  });
});
