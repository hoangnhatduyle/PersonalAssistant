import { describe, expect, it } from "vitest";
import { parseStage2Response, prepareBodyForModel, stripQuotedReply } from "@/lib/email-triage/stage2";

describe("stripQuotedReply", () => {
  it("drops > quoted lines and everything after an 'On ... wrote:' separator", () => {
    const text = ["Sounds good, see you Friday.", "> older quoted line", "", "On Mon, Oct 5, 2026 at 9:00 AM Prof <p@u.edu> wrote:", "Original message body"].join("\n");
    expect(stripQuotedReply(text)).toBe("Sounds good, see you Friday.\n");
  });

  it("cuts at Outlook-style original-message and underscore separators", () => {
    expect(stripQuotedReply("New text\n-----Original Message-----\nFrom: x")).toBe("New text");
    expect(stripQuotedReply("New text\n________________________________\nFrom: x")).toBe("New text");
  });
});

describe("prepareBodyForModel", () => {
  it("prefers the text part over html", () => {
    expect(prepareBodyForModel({ text: "plain body", html: "<p>html body</p>" })).toBe("plain body");
  });

  it("converts html when there is no text part", () => {
    const body = prepareBodyForModel({ text: null, html: "<p>Hello <b>there</b></p><script>alert(1)</script>" });
    expect(body).toContain("Hello");
    expect(body).not.toContain("alert");
  });

  it("collapses whitespace and truncates to the cap", () => {
    expect(prepareBodyForModel({ text: "a   b\n\n\n\nc", html: null })).toBe("a b\n\nc");
    expect(prepareBodyForModel({ text: "x".repeat(10_000), html: null })).toHaveLength(6000);
    expect(prepareBodyForModel({ text: "x".repeat(50), html: null }, 10)).toHaveLength(10);
  });

  it("returns an empty string for an empty message", () => {
    expect(prepareBodyForModel({ text: null, html: null })).toBe("");
  });
});

describe("parseStage2Response", () => {
  it("parses an action", () => {
    expect(
      parseStage2Response(JSON.stringify({ suggested_action: { kind: "task", title: "Sign the lease", due_at: "2026-10-16T17:00:00-04:00" } })),
    ).toMatchObject({ kind: "task", title: "Sign the lease" });
  });

  it("returns null for a null action or a malformed action object", () => {
    expect(parseStage2Response(JSON.stringify({ suggested_action: null }))).toBeNull();
    expect(parseStage2Response(JSON.stringify({}))).toBeNull();
    expect(parseStage2Response(JSON.stringify({ suggested_action: { kind: "delete_everything", title: "x" } }))).toBeNull();
  });

  it("throws on invalid JSON (the caller treats that as a non-fatal per-message failure)", () => {
    expect(() => parseStage2Response("oops")).toThrow(/invalid JSON/);
  });
});
