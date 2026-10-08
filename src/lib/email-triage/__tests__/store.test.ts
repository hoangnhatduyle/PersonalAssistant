import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadTriageItems, rowToTriageItem, setTriageItemStatus, upsertTriageRows } from "@/lib/email-triage/store";
import type { MailMessage } from "@/lib/mail/types";

type Row = Database["public"]["Tables"]["mail_triage_items"]["Row"];

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    user_id: "user-1",
    mail_account_id: "acct-1",
    provider: "google",
    provider_message_id: `msg-${id}`,
    subject: `Subject ${id}`,
    sender: "Ada <ada@example.com>",
    received_at: "2026-10-10T12:00:00.000Z",
    web_link: null,
    bucket: "needs_action",
    reason: "why",
    suggested_action: null,
    stage2_at: null,
    status: "open",
    resolved_at: null,
    triaged_at: "2026-10-11T12:00:00.000Z",
    expires_at: "2026-10-25T12:00:00.000Z",
    created_at: "2026-10-11T12:00:00.000Z",
    updated_at: "2026-10-11T12:00:00.000Z",
    ...overrides,
  };
}

/** Records the filter calls so a test can assert what a query was scoped by. */
function queryRecorder(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gt", "in", "update", "upsert"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  const supabase = { from: () => chain } as unknown as SupabaseClient<Database>;
  return { supabase, calls };
}

describe("rowToTriageItem", () => {
  it("maps the row to the client shape without any body or snippet", () => {
    const item = rowToTriageItem(row("1", { web_link: "https://mail/1", suggested_action: { kind: "task", title: "Do it" } }));
    expect(item).toEqual({
      id: "1",
      provider: "google",
      messageId: "msg-1",
      subject: "Subject 1",
      sender: "Ada <ada@example.com>",
      receivedAt: "2026-10-10T12:00:00.000Z",
      webLink: "https://mail/1",
      bucket: "needs_action",
      reason: "why",
      suggestedAction: { kind: "task", title: "Do it" },
      status: "open",
      triagedAt: "2026-10-11T12:00:00.000Z",
      expiresAt: "2026-10-25T12:00:00.000Z",
    });
  });

  it("drops a stored action that no longer validates instead of trusting it", () => {
    expect(rowToTriageItem(row("1", { suggested_action: { kind: "wire_money", title: "x" } })).suggestedAction).toBeNull();
    expect(rowToTriageItem(row("1", { suggested_action: "garbage" })).suggestedAction).toBeNull();
    expect(rowToTriageItem(row("1", { suggested_action: null })).suggestedAction).toBeNull();
  });
});

describe("loadTriageItems", () => {
  const now = new Date("2026-10-12T00:00:00Z");

  it("scopes to the user, excludes expired rows, defaults to open items, and ranks the result", async () => {
    const { supabase, calls } = queryRecorder({
      data: [row("old-fyi", { bucket: "fyi" }), row("act", { bucket: "needs_action" })],
      error: null,
    });

    const items = await loadTriageItems(supabase, "user-1", { now });

    expect(items.map((item) => item.id)).toEqual(["act", "old-fyi"]);
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["gt", "expires_at", now.toISOString()]);
    expect(calls).toContainEqual(["eq", "status", "open"]);
  });

  it("includes resolved items for scope 'all' and filters by provider when given", async () => {
    const { supabase, calls } = queryRecorder({ data: [], error: null });
    await loadTriageItems(supabase, "user-1", { scope: "all", provider: "microsoft", now });

    expect(calls.some(([method, column]) => method === "eq" && column === "status")).toBe(false);
    expect(calls).toContainEqual(["eq", "provider", "microsoft"]);
  });

  it("throws on a query error", async () => {
    const { supabase } = queryRecorder({ data: null, error: new Error("db") });
    await expect(loadTriageItems(supabase, "user-1")).rejects.toThrow("db");
  });
});

describe("upsertTriageRows", () => {
  const message: MailMessage = {
    id: "msg-1",
    provider: "google",
    subject: "S".repeat(900),
    from: "Ada <ada@example.com>",
    snippet: "SNIPPET MUST NOT BE STORED",
    receivedAt: "2026-10-10T12:00:00.000Z",
    isRead: false,
    webLink: "https://mail/1",
  };

  it("stores display fields only, a 14-day expiry, an open status, and upserts on (account, message)", async () => {
    const { supabase, calls } = queryRecorder({ data: null, error: null });
    const now = new Date("2026-10-12T00:00:00Z");

    await upsertTriageRows(
      supabase,
      "user-1",
      [{ accountId: "acct-1", message, bucket: "important", reason: "r", suggestedAction: { kind: "task", title: "T" }, stage2At: "2026-10-12T00:00:00.000Z" }],
      now,
    );

    const [, rows, options] = calls.find(([method]) => method === "upsert") as [string, Array<Record<string, unknown>>, { onConflict: string }];
    expect(options).toEqual({ onConflict: "mail_account_id,provider_message_id" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      mail_account_id: "acct-1",
      provider: "google",
      provider_message_id: "msg-1",
      bucket: "important",
      reason: "r",
      suggested_action: { kind: "task", title: "T" },
      status: "open",
      resolved_at: null,
      triaged_at: "2026-10-12T00:00:00.000Z",
      expires_at: "2026-10-26T00:00:00.000Z",
      web_link: "https://mail/1",
    });
    expect((rows[0].subject as string).length).toBe(500);
    expect(JSON.stringify(rows)).not.toContain("SNIPPET MUST NOT BE STORED");
    expect(Object.keys(rows[0])).not.toContain("snippet");
    expect(Object.keys(rows[0])).not.toContain("body");
  });

  it("does nothing for an empty batch", async () => {
    const { supabase, calls } = queryRecorder({ data: null, error: null });
    await upsertTriageRows(supabase, "user-1", []);
    expect(calls).toHaveLength(0);
  });
});

describe("setTriageItemStatus", () => {
  it("resolves only the caller's own still-open item and reports whether anything changed", async () => {
    const hit = queryRecorder({ data: [{ id: "item-1" }], error: null });
    expect(await setTriageItemStatus(hit.supabase, "user-1", "item-1", "acted", new Date("2026-10-12T00:00:00Z"))).toBe(true);
    expect(hit.calls).toContainEqual(["update", { status: "acted", resolved_at: "2026-10-12T00:00:00.000Z" }]);
    expect(hit.calls).toContainEqual(["eq", "id", "item-1"]);
    expect(hit.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(hit.calls).toContainEqual(["eq", "status", "open"]);

    const miss = queryRecorder({ data: [], error: null });
    expect(await setTriageItemStatus(miss.supabase, "user-1", "someone-elses", "dismissed")).toBe(false);
  });

  it("throws on a database error", async () => {
    const { supabase } = queryRecorder({ data: null, error: new Error("db") });
    await expect(setTriageItemStatus(supabase, "user-1", "x", "dismissed")).rejects.toThrow("db");
  });
});

