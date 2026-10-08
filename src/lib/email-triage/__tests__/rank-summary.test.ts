import { describe, expect, it } from "vitest";
import { attentionItems, rankTriageItems } from "@/lib/email-triage/rank";
import { buildAttentionSpeech, describeSuggestedAction, senderName } from "@/lib/email-triage/summary";
import type { TriageBucket, TriageItem } from "@/lib/email-triage/types";

function item(id: string, bucket: TriageBucket, receivedAt: string, overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id,
    provider: "google",
    messageId: `msg-${id}`,
    subject: `Subject ${id}`,
    sender: "Ada Lovelace <ada@example.com>",
    receivedAt,
    webLink: null,
    bucket,
    reason: `Reason ${id}.`,
    suggestedAction: null,
    status: "open",
    triagedAt: "2026-10-11T12:00:00.000Z",
    expiresAt: "2026-10-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("rankTriageItems / attentionItems", () => {
  const items = [
    item("fyi", "fyi", "2026-10-11T10:00:00Z"),
    item("imp-old", "important", "2026-10-08T10:00:00Z"),
    item("act-old", "needs_action", "2026-10-07T10:00:00Z"),
    item("act-new", "needs_action", "2026-10-10T10:00:00Z"),
    item("imp-new", "important", "2026-10-09T10:00:00Z"),
    item("ignore", "ignore", "2026-10-11T11:00:00Z"),
  ];

  it("orders needs-action, important, fyi, ignore, newest first within a bucket, without mutating the input", () => {
    const ranked = rankTriageItems(items);
    expect(ranked.map((entry) => entry.id)).toEqual(["act-new", "act-old", "imp-new", "imp-old", "fyi", "ignore"]);
    expect(items[0].id).toBe("fyi");
  });

  it("keeps only open important / needs-action items", () => {
    const withResolved = [...items, item("done", "needs_action", "2026-10-11T00:00:00Z", { status: "acted" })];
    expect(attentionItems(withResolved).map((entry) => entry.id)).toEqual(["act-new", "act-old", "imp-new", "imp-old"]);
  });
});

describe("senderName", () => {
  it("extracts a display name, or falls back to the address local part", () => {
    expect(senderName("Ada Lovelace <ada@example.com>")).toBe("Ada Lovelace");
    expect(senderName('"Lovelace, Ada" <ada@example.com>')).toBe("Lovelace, Ada");
    expect(senderName("<ada@example.com>")).toBe("ada");
    expect(senderName("ada@example.com")).toBe("ada");
  });
});

describe("describeSuggestedAction", () => {
  it("describes each kind without any date string", () => {
    expect(describeSuggestedAction({ kind: "task", title: "Sign lease" })).toBe("add a task called Sign lease");
    expect(describeSuggestedAction({ kind: "task", title: "Call", reminders_enabled: true })).toBe("add a task with a reminder called Call");
    expect(describeSuggestedAction({ kind: "deadline", title: "Essay", due_at: "2026-10-16T21:00:00.000Z" })).toBe("add a deadline called Essay");
    expect(describeSuggestedAction({ kind: "event", title: "Interview" })).toBe("add a calendar event called Interview");
  });
});

describe("buildAttentionSpeech", () => {
  it("says so when nothing needs attention", () => {
    expect(buildAttentionSpeech([item("fyi", "fyi", "2026-10-11T10:00:00Z")])).toMatch(/no important or action-needed emails/i);
    expect(buildAttentionSpeech([])).toMatch(/no important or action-needed emails/i);
  });

  it("gives counts, the top three with reasons, an overflow note and one offer", () => {
    const items = [
      item("a", "needs_action", "2026-10-11T10:00:00Z", {
        subject: "Lease renewal",
        sender: "Ada Lovelace <ada@example.com>",
        reason: "Asks you to sign by Friday",
        suggestedAction: { kind: "task", title: "Sign the lease" },
      }),
      item("b", "needs_action", "2026-10-10T10:00:00Z"),
      item("c", "important", "2026-10-09T10:00:00Z"),
      item("d", "important", "2026-10-08T10:00:00Z"),
    ];

    const speech = buildAttentionSpeech(items);

    expect(speech).toContain("2 emails need action and 2 are important.");
    expect(speech).toContain("First, Lease renewal, from Ada Lovelace: Asks you to sign by Friday.");
    expect(speech).toContain("Next, Subject b");
    expect(speech).toContain("Then, Subject c");
    expect(speech).not.toContain("Subject d");
    expect(speech).toContain("1 more is on your dashboard.");
    expect(speech).toContain('For "Lease renewal" I can add a task called Sign the lease. Want me to?');
    expect(speech).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("uses singular phrasing and makes no offer when no top item has an action", () => {
    const speech = buildAttentionSpeech([item("a", "needs_action", "2026-10-11T10:00:00Z")]);
    expect(speech).toContain("1 email needs action.");
    expect(speech).not.toContain("Want me to");
  });
});
