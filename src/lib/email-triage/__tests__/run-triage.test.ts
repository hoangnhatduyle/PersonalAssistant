import { describe, expect, it, vi } from "vitest";
import { runEmailTriage, type ExistingTriageRow, type TriageDeps } from "@/lib/email-triage/run-triage";
import type { Stage1Input, Stage1Result } from "@/lib/email-triage/stage1";
import type { RawSuggestedAction } from "@/lib/email-triage/stage2";
import { MailReauthRequiredError } from "@/lib/mail/errors";
import type { MailMessage } from "@/lib/mail/types";

const NOW = new Date("2026-10-11T16:00:00Z");
const COURSE = "7d0c9d3e-4f5a-4b7c-8a1e-2b3c4d5e6f70";

function message(id: string, receivedAt = "2026-10-10T12:00:00.000Z"): MailMessage {
  return { id, provider: "google", subject: `Subject ${id}`, from: "Prof <prof@u.edu>", snippet: `snippet ${id}`, receivedAt, isRead: false, webLink: `https://mail/${id}` };
}

interface Overrides extends Partial<TriageDeps> {
  messages?: MailMessage[];
  truncated?: boolean;
  existing?: ExistingTriageRow[];
  buckets?: Record<string, Stage1Result["bucket"]>;
}

/** All-fake deps that record what was saved and what reached the LLM. */
function makeDeps(overrides: Overrides = {}) {
  const messages = overrides.messages ?? [];
  const buckets = overrides.buckets ?? {};
  const calls = {
    classify: [] as Stage1Input[][],
    extract: [] as Array<{ body: string; subject: string }>,
    fetchBody: [] as string[],
    saveNew: [] as Parameters<TriageDeps["saveNew"]>[0][],
    saveStage2: [] as Parameters<TriageDeps["saveStage2"]>[0][],
  };
  const deps: TriageDeps = {
    now: () => NOW,
    getAccount: async () => ({ id: "acct-1", refreshToken: "rt" }),
    checkRateLimit: async () => true,
    refreshAccessToken: async () => "access",
    searchUnread: async () => ({ messages, truncated: overrides.truncated ?? false }),
    fetchBody: async (_token, id) => {
      calls.fetchBody.push(id);
      return { html: null, text: `Body of ${id}` };
    },
    loadExisting: async () => overrides.existing ?? [],
    loadCourses: async () => [{ id: COURSE, code: "CS 101", name: "Intro" }],
    getTimeZone: async () => "America/New_York",
    classify: async (inputs) => {
      calls.classify.push(inputs);
      // refs are m1..mN in message order
      return inputs.map((input, index): Stage1Result => ({
        ref: input.ref,
        bucket: buckets[messages.filter((m) => !(overrides.existing ?? []).some((e) => e.messageId === m.id))[index].id] ?? "fyi",
        reason: `reason ${input.ref}`,
      }));
    },
    extract: async (input): Promise<RawSuggestedAction | null> => {
      calls.extract.push({ body: input.body, subject: input.subject });
      return { kind: "task", title: `Handle ${input.subject}`, due_at: "2026-10-16T17:00:00-04:00" };
    },
    saveNew: async (rows) => {
      calls.saveNew.push(rows);
    },
    saveStage2: async (updates) => {
      calls.saveStage2.push(updates);
    },
    loadOpenItems: async () => [],
    ...overrides,
  };
  return { deps, calls };
}

describe("runEmailTriage: account states", () => {
  it("returns not_connected without spending rate limit or calling the provider", async () => {
    const { deps } = makeDeps({ getAccount: async () => null, checkRateLimit: vi.fn(async () => true) });
    expect(await runEmailTriage(deps, { provider: "google" })).toEqual({ status: "not_connected" });
    expect(deps.checkRateLimit).not.toHaveBeenCalled();
  });

  it("returns needs_reauth when the stored token can't be decrypted, the grant is revoked, or listing fails with reauth", async () => {
    const onDecrypt = makeDeps({ getAccount: async () => { throw new MailReauthRequiredError("google"); } });
    expect(await runEmailTriage(onDecrypt.deps, { provider: "google" })).toEqual({ status: "needs_reauth" });

    const onRefresh = makeDeps({ refreshAccessToken: async () => { throw new MailReauthRequiredError("google"); } });
    expect(await runEmailTriage(onRefresh.deps, { provider: "google" })).toEqual({ status: "needs_reauth" });

    const onSearch = makeDeps({ searchUnread: async () => { throw new MailReauthRequiredError("google"); } });
    expect(await runEmailTriage(onSearch.deps, { provider: "google" })).toEqual({ status: "needs_reauth" });
  });

  it("returns rate_limited before touching the provider or OpenAI", async () => {
    const refresh = vi.fn(async () => "access");
    const { deps, calls } = makeDeps({ checkRateLimit: async () => false, refreshAccessToken: refresh, messages: [message("1")] });
    expect(await runEmailTriage(deps, { provider: "google" })).toEqual({ status: "rate_limited" });
    expect(refresh).not.toHaveBeenCalled();
    expect(calls.classify).toHaveLength(0);
  });

  it("rethrows unexpected provider errors", async () => {
    const { deps } = makeDeps({ searchUnread: async () => { throw new Error("Gmail API returned 500"); } });
    await expect(runEmailTriage(deps, { provider: "google" })).rejects.toThrow("Gmail API returned 500");
  });
});

describe("runEmailTriage: two-stage processing", () => {
  it("classifies everything from subject/sender/snippet, and fetches bodies only for important/needs_action", async () => {
    const messages = [message("a"), message("b"), message("c"), message("d")];
    const { deps, calls } = makeDeps({ messages, buckets: { a: "needs_action", b: "fyi", c: "important", d: "ignore" } });

    const outcome = await runEmailTriage(deps, { provider: "google" });

    expect(outcome.status).toBe("ok");
    expect(calls.classify).toHaveLength(1);
    expect(calls.classify[0]).toHaveLength(4);
    expect(calls.classify[0].every((input) => Object.keys(input).sort().join() === "from,ref,snippet,subject")).toBe(true);
    expect([...calls.fetchBody].sort()).toEqual(["a", "c"]);
    expect(calls.extract.map((entry) => entry.body).sort()).toEqual(["Body of a", "Body of c"]);

    const saved = calls.saveNew[0];
    expect(saved).toHaveLength(4);
    const byId = new Map(saved.map((row) => [row.message.id, row]));
    expect(byId.get("a")?.suggestedAction).toMatchObject({ kind: "task", title: "Handle Subject a" });
    expect(byId.get("a")?.stage2At).toBe(NOW.toISOString());
    expect(byId.get("b")?.suggestedAction).toBeNull();
    expect(byId.get("b")?.stage2At).toBeNull();
    // No body or snippet is part of what gets stored.
    expect(JSON.stringify(saved)).not.toContain("Body of");
    expect(saved.every((row) => !("snippet" in row) && row.accountId === "acct-1")).toBe(true);
  });

  it("caps stage 2 at 10 bodies, newest needs_action first, leaving the rest for a later run", async () => {
    const messages = Array.from({ length: 14 }, (_, index) =>
      message(`m${index}`, new Date(Date.UTC(2026, 9, 1 + index)).toISOString()),
    );
    const buckets = Object.fromEntries(messages.map((m, index) => [m.id, index < 12 ? "needs_action" : "important"])) as Overrides["buckets"];
    const { deps, calls } = makeDeps({ messages, buckets });

    const outcome = await runEmailTriage(deps, { provider: "google" });

    expect(calls.fetchBody).toHaveLength(10);
    // needs_action (m0..m11) outrank important (m12, m13); newest of those first.
    expect(calls.fetchBody).not.toContain("m12");
    expect(calls.fetchBody).not.toContain("m13");
    expect(calls.fetchBody).toContain("m11");
    expect(calls.fetchBody).not.toContain("m0");
    const skipped = calls.saveNew[0].filter((row) => row.stage2At === null);
    expect(skipped).toHaveLength(4);
    expect(outcome.status === "ok" && outcome.stats.stage2).toBe(10);
  });

  it("keeps a message without an action when its stage 2 fails, and still stores everything", async () => {
    const messages = [message("ok"), message("boom")];
    const { deps, calls } = makeDeps({
      messages,
      buckets: { ok: "needs_action", boom: "needs_action" },
      extract: async (input) => {
        if (input.subject === "Subject boom") throw new Error("openai 500");
        return { kind: "task", title: "Fine" };
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await runEmailTriage(deps, { provider: "google" });

    expect(outcome.status).toBe("ok");
    const byId = new Map(calls.saveNew[0].map((row) => [row.message.id, row]));
    expect(byId.get("ok")?.suggestedAction).not.toBeNull();
    expect(byId.get("boom")?.suggestedAction).toBeNull();
    expect(byId.get("boom")?.stage2At).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("Body of");
    errorSpy.mockRestore();
  });

  it("stores nothing and rethrows when stage 1 fails", async () => {
    const { deps, calls } = makeDeps({
      messages: [message("a")],
      classify: async () => {
        throw new Error("openai down");
      },
    });
    await expect(runEmailTriage(deps, { provider: "google" })).rejects.toThrow("openai down");
    expect(calls.saveNew).toHaveLength(0);
    expect(calls.fetchBody).toHaveLength(0);
  });

  it("drops messages the model did not classify instead of defaulting a bucket", async () => {
    const { deps, calls } = makeDeps({
      messages: [message("a"), message("b")],
      classify: async (inputs) => [{ ref: inputs[0].ref, bucket: "fyi", reason: "ok" }],
    });
    await runEmailTriage(deps, { provider: "google" });
    expect(calls.saveNew[0].map((row) => row.message.id)).toEqual(["a"]);
  });

  it("makes no LLM call when there is no unread mail", async () => {
    const { deps, calls } = makeDeps({ messages: [] });
    const outcome = await runEmailTriage(deps, { provider: "google" });
    expect(calls.classify).toHaveLength(0);
    expect(calls.saveNew).toHaveLength(0);
    expect(outcome).toMatchObject({ status: "ok", stats: { considered: 0, classified: 0, stage2: 0 } });
  });
});

describe("runEmailTriage: re-triage", () => {
  it("skips messages already triaged (any status) and does not re-classify them", async () => {
    const existing: ExistingTriageRow[] = [
      { id: "row-a", messageId: "a", bucket: "fyi", status: "open", stage2At: null, receivedAt: "2026-10-10T12:00:00.000Z" },
      { id: "row-b", messageId: "b", bucket: "needs_action", status: "dismissed", stage2At: "2026-10-10T13:00:00.000Z", receivedAt: "2026-10-10T12:00:00.000Z" },
    ];
    const { deps, calls } = makeDeps({ messages: [message("a"), message("b"), message("c")], existing, buckets: { c: "fyi" } });

    const outcome = await runEmailTriage(deps, { provider: "google" });

    expect(calls.classify[0].map((input) => input.snippet)).toEqual(["snippet c"]);
    expect(calls.saveNew[0].map((row) => row.message.id)).toEqual(["c"]);
    expect(calls.fetchBody).toHaveLength(0);
    expect(outcome).toMatchObject({ status: "ok", stats: { classified: 1, skippedAlreadyTriaged: 2 } });
  });

  it("retries stage 2 only for open actionable rows that never completed it, updating the existing row", async () => {
    const existing: ExistingTriageRow[] = [
      { id: "row-a", messageId: "a", bucket: "needs_action", status: "open", stage2At: null, receivedAt: "2026-10-10T12:00:00.000Z" },
      { id: "row-b", messageId: "b", bucket: "needs_action", status: "open", stage2At: "2026-10-10T13:00:00.000Z", receivedAt: "2026-10-10T12:00:00.000Z" },
      { id: "row-c", messageId: "c", bucket: "fyi", status: "open", stage2At: null, receivedAt: "2026-10-10T12:00:00.000Z" },
      { id: "row-d", messageId: "d", bucket: "needs_action", status: "dismissed", stage2At: null, receivedAt: "2026-10-10T12:00:00.000Z" },
    ];
    const { deps, calls } = makeDeps({ messages: [message("a"), message("b"), message("c"), message("d")], existing });

    await runEmailTriage(deps, { provider: "google" });

    expect(calls.classify).toHaveLength(0);
    expect(calls.fetchBody).toEqual(["a"]);
    expect(calls.saveNew).toHaveLength(0);
    expect(calls.saveStage2).toHaveLength(1);
    expect(calls.saveStage2[0]).toEqual([
      { id: "row-a", suggestedAction: expect.objectContaining({ kind: "task" }), stage2At: NOW.toISOString() },
    ]);
  });
});

describe("runEmailTriage: caps and range", () => {
  it("caps classification at 50 messages and flags truncation", async () => {
    const messages = Array.from({ length: 60 }, (_, index) => message(`m${index}`));
    const { deps, calls } = makeDeps({ messages, truncated: true });
    const outcome = await runEmailTriage(deps, { provider: "google" });
    expect(calls.classify[0]).toHaveLength(50);
    expect(outcome).toMatchObject({ status: "ok", stats: { considered: 50, truncated: true } });
  });

  it("asks the provider for unread mail since N days back (default 7, clamped to 30)", async () => {
    const searchUnread = vi.fn(async () => ({ messages: [], truncated: false }));
    const { deps } = makeDeps({ searchUnread });

    await runEmailTriage(deps, { provider: "google" });
    expect(searchUnread).toHaveBeenLastCalledWith("access", new Date("2026-10-04T16:00:00Z"), 50);

    await runEmailTriage(deps, { provider: "google", days: 3 });
    expect(searchUnread).toHaveBeenLastCalledWith("access", new Date("2026-10-08T16:00:00Z"), 50);

    await runEmailTriage(deps, { provider: "google", days: 400 });
    expect(searchUnread).toHaveBeenLastCalledWith("access", new Date("2026-09-11T16:00:00Z"), 50);
  });
});
