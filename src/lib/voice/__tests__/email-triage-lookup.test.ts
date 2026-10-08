import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { TriageItem, TriageRunOutcome } from "@/lib/email-triage/types";
import { MailReauthRequiredError } from "@/lib/mail/errors";

const mocks = vi.hoisted(() => ({
  getMailAccount: vi.fn(),
  runEmailTriage: vi.fn(),
  loadTriageItems: vi.fn(),
}));

vi.mock("@/lib/mail/accounts", () => ({ getMailAccount: mocks.getMailAccount }));
vi.mock("@/lib/email-triage/deps", () => ({ createTriageDeps: vi.fn(() => ({})) }));
vi.mock("@/lib/email-triage/run-triage", () => ({ runEmailTriage: mocks.runEmailTriage }));
vi.mock("@/lib/email-triage/store", () => ({ loadTriageItems: mocks.loadTriageItems }));

import { runEmailTriageLookup, runStoredEmailTriageLookup } from "@/lib/voice/email-triage-lookup";

const fakeSupabase = {} as SupabaseClient<Database>;

function item(id: string, overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id,
    provider: "google",
    messageId: `msg-${id}`,
    subject: `Subject ${id}`,
    sender: "Ada <ada@example.com>",
    receivedAt: "2026-10-10T12:00:00.000Z",
    webLink: null,
    bucket: "needs_action",
    reason: `Reason ${id}`,
    suggestedAction: null,
    status: "open",
    triagedAt: "2026-10-11T12:00:00.000Z",
    expiresAt: "2026-10-25T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getMailAccount.mockReset();
  mocks.runEmailTriage.mockReset();
  mocks.loadTriageItems.mockReset();
});

describe("runStoredEmailTriageLookup (get_email_triage)", () => {
  it("speaks the stored attention list and returns at most the top three items with their ids and actions", async () => {
    mocks.loadTriageItems.mockResolvedValue([
      item("a", { suggestedAction: { kind: "task", title: "Sign the lease" } }),
      item("b"),
      item("c", { bucket: "important" }),
      item("d", { bucket: "important" }),
      item("fyi", { bucket: "fyi" }),
    ]);

    const result = await runStoredEmailTriageLookup(fakeSupabase, "user-1");

    expect(mocks.loadTriageItems).toHaveBeenCalledWith(fakeSupabase, "user-1", { scope: "open" });
    expect(result.message).toContain("2 emails need action and 2 are important.");
    expect(result.items?.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(result.items?.[0]).toEqual({
      id: "a",
      bucket: "needs_action",
      subject: "Subject a",
      from: "Ada <ada@example.com>",
      reason: "Reason a",
      suggestedAction: { kind: "task", title: "Sign the lease" },
    });
  });

  it("says nothing is waiting when no results are stored, without running a check", async () => {
    mocks.loadTriageItems.mockResolvedValue([]);
    const result = await runStoredEmailTriageLookup(fakeSupabase, "user-1");
    expect(result.message).toMatch(/no important or action-needed emails/i);
    expect(mocks.runEmailTriage).not.toHaveBeenCalled();
    expect(mocks.getMailAccount).not.toHaveBeenCalled();
  });
});

describe("runEmailTriageLookup (triage_email)", () => {
  it("does not run triage when the account is unspecified: it reports connected accounts so the model asks which one", async () => {
    mocks.getMailAccount.mockResolvedValue({ id: "acct" });

    const result = await runEmailTriageLookup(fakeSupabase, "user-1", { provider: null, days: null });

    expect(result).toMatchObject({ needsProvider: true, connected: ["google", "microsoft"] });
    expect(result.message).toBe("Which account should I check, Gmail or Outlook?");
    expect(mocks.runEmailTriage).not.toHaveBeenCalled();
  });

  it("only offers the connected accounts, treating an undecryptable one as connected (it needs reconnecting)", async () => {
    mocks.getMailAccount.mockImplementation(async (_s: unknown, _u: string, provider: string) => {
      if (provider === "google") throw new MailReauthRequiredError("google");
      return null;
    });
    const result = await runEmailTriageLookup(fakeSupabase, "user-1", { provider: null, days: null });
    expect(result.connected).toEqual(["google"]);
  });

  it("tells the user to connect an account when none is connected", async () => {
    mocks.getMailAccount.mockResolvedValue(null);
    const result = await runEmailTriageLookup(fakeSupabase, "user-1", { provider: null, days: null });
    expect(result.needsProvider).toBe(false);
    expect(result.message).toMatch(/haven't connected/i);
  });

  it("runs the triage for the named provider and range, then speaks that provider's attention list", async () => {
    const outcome: TriageRunOutcome = {
      status: "ok",
      items: [item("g", { suggestedAction: { kind: "task", title: "Reply to Ada" } }), item("o", { provider: "microsoft" })],
      stats: { considered: 5, classified: 3, stage2: 1, skippedAlreadyTriaged: 2, truncated: false },
    };
    mocks.runEmailTriage.mockResolvedValue(outcome);

    const result = await runEmailTriageLookup(fakeSupabase, "user-1", { provider: "google", days: 3 });

    expect(mocks.runEmailTriage).toHaveBeenCalledWith(expect.anything(), { provider: "google", days: 3 });
    expect(result.message).toContain("I checked 3 new emails in Gmail.");
    expect(result.message).toContain("1 email needs action.");
    expect(result.message).toContain("I can add a task called Reply to Ada");
    expect(result.items?.map((entry) => entry.id)).toEqual(["g"]);
  });

  it("mentions truncation and the no-unread case", async () => {
    mocks.runEmailTriage.mockResolvedValue({
      status: "ok",
      items: [],
      stats: { considered: 50, classified: 50, stage2: 10, skippedAlreadyTriaged: 0, truncated: true },
    } satisfies TriageRunOutcome);
    expect((await runEmailTriageLookup(fakeSupabase, "user-1", { provider: "google", days: null })).message).toContain(
      "more unread mail than I check in one go",
    );

    mocks.runEmailTriage.mockResolvedValue({
      status: "ok",
      items: [],
      stats: { considered: 0, classified: 0, stage2: 0, skippedAlreadyTriaged: 0, truncated: false },
    } satisfies TriageRunOutcome);
    expect((await runEmailTriageLookup(fakeSupabase, "user-1", { provider: "microsoft", days: null })).message).toContain(
      "I found no unread Outlook mail in that range.",
    );
  });

  it.each([
    ["not_connected", /isn't connected/],
    ["needs_reauth", /connection expired/],
    ["rate_limited", /checked email a lot/],
  ] as const)("speaks a plain message for %s", async (status, pattern) => {
    mocks.runEmailTriage.mockResolvedValue({ status } as TriageRunOutcome);
    const result = await runEmailTriageLookup(fakeSupabase, "user-1", { provider: "google", days: null });
    expect(result.message).toMatch(pattern);
    expect(result.items).toBeUndefined();
  });

  it("turns an unexpected failure (e.g. OpenAI down) into a retry message instead of throwing", async () => {
    mocks.runEmailTriage.mockRejectedValue(new Error("openai 500"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runEmailTriageLookup(fakeSupabase, "user-1", { provider: "google", days: null });
    expect(result.message).toMatch(/couldn't check your Gmail/);
    errorSpy.mockRestore();
  });
});
