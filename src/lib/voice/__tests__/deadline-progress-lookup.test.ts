import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { runDeadlineProgressLookup } from "../deadline-progress-lookup";
import { makeAppointment } from "@/lib/dashboard/__tests__/fixtures";

type DeadlineFields = { title: string; status: string; estimated_hours: number | null; progress_percent: number | null; progress_note: string | null };
type Session = ReturnType<typeof makeAppointment>;

/** A chainable stand-in for the two queries the lookup makes; every filter call is a no-op that returns the same builder. */
function fakeSupabase(deadline: DeadlineFields | null, sessions: Session[]): SupabaseClient<Database> {
  const builder = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is"]) chain[method] = () => chain;
    chain.maybeSingle = async () => ({ data: result });
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result }).then(resolve);
    return chain;
  };
  return { from: (table: string) => builder(table === "deadlines" ? deadline : sessions) } as unknown as SupabaseClient<Database>;
}

const deadline = (overrides: Partial<DeadlineFields> = {}): DeadlineFields => ({
  title: "Term paper",
  status: "In Progress",
  estimated_hours: null,
  progress_percent: null,
  progress_note: null,
  ...overrides,
});
const session = (status: "planned" | "done" | "skipped", minutes = 60) => makeAppointment({ deadline_id: "d-1", session_status: status, duration_minutes: minutes });

const ask = async (d: DeadlineFields | null, sessions: Session[] = []) => (await runDeadlineProgressLookup(fakeSupabase(d, sessions), "u-1", "d-1")).message;

describe("runDeadlineProgressLookup", () => {
  it("says so when the deadline cannot be found", async () => {
    expect(await ask(null)).toBe("I couldn't find that deadline.");
  });

  it("keeps the original wording when nothing new has been recorded", async () => {
    expect(await ask(deadline())).toBe("No sessions are planned yet for Term paper.");
    expect(await ask(deadline(), [session("done"), session("planned")])).toBe("You've completed 1 of 2 sessions for Term paper — 1 left.");
    expect(await ask(deadline(), [session("done"), session("done")])).toBe("You've completed all 2 sessions for Term paper.");
    expect(await ask(deadline(), [session("done"), session("skipped"), session("planned")])).toBe("You've completed 1 of 3 sessions for Term paper — 2 left, including 1 skipped.");
  });

  it("reports a hand-set percent and its note even when there are no sessions", async () => {
    const message = await ask(deadline({ progress_percent: 60, progress_note: "waiting on data" }));
    expect(message).toBe("No sessions are planned yet for Term paper. It's about 60% done, as you set it. Note: waiting on data");
  });

  it("measures done sessions against the estimate when there is one", async () => {
    const message = await ask(deadline({ estimated_hours: 4 }), [session("done", 60), session("done", 60), session("planned", 120)]);
    expect(message).toContain("You've completed 2 of 3 sessions");
    expect(message).toContain("Against your 4 h estimate, that's about 50% done.");
  });

  it("mentions the estimate on its own when progress is hand-set", async () => {
    const message = await ask(deadline({ estimated_hours: 8, progress_percent: 25 }));
    expect(message).toContain("It's about 25% done, as you set it.");
    expect(message).toContain("Your estimate is 8 h.");
  });

  it("treats a deliberate 0 percent as real, not unset", async () => {
    expect(await ask(deadline({ progress_percent: 0 }))).toContain("It's about 0% done, as you set it.");
  });
});
