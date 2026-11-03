import { describe, expect, it } from "vitest";
import { endRequestSchema, toolRequestSchema } from "../schemas";

const CALL_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const valid = { callId: CALL_ID, name: "get_schedule", arguments: "{}", lastUserTranscript: "what's today", batch: ["get_schedule"] };

describe("toolRequestSchema", () => {
  it("accepts a well-formed tool call, with or without a transcript", () => {
    expect(toolRequestSchema.safeParse(valid).success).toBe(true);
    expect(toolRequestSchema.safeParse({ ...valid, lastUserTranscript: null }).success).toBe(true);
  });

  it.each([
    ["a non-uuid call id", { ...valid, callId: "nope" }],
    ["an empty tool name", { ...valid, name: "" }],
    ["an empty batch", { ...valid, batch: [] }],
    ["an oversized batch", { ...valid, batch: Array(9).fill("x") }],
    ["oversized arguments", { ...valid, arguments: "x".repeat(50_001) }],
    ["an oversized transcript", { ...valid, lastUserTranscript: "x".repeat(4001) }],
    ["a missing transcript field", { callId: CALL_ID, name: "x", arguments: "{}", batch: ["x"] }],
    ["no body", null],
  ])("rejects %s", (_label, body) => {
    expect(toolRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("endRequestSchema", () => {
  it("defaults the reason to user, so a bare sendBeacon still ends the call", () => {
    expect(endRequestSchema.parse({})).toEqual({ reason: "user" });
  });

  it.each(["user", "cap", "idle", "hidden", "error"])("accepts %s", (reason) => {
    expect(endRequestSchema.parse({ reason })).toEqual({ reason });
  });

  it("does not let a client claim the server-only 'superseded' reason, or an invented one", () => {
    expect(endRequestSchema.safeParse({ reason: "superseded" }).success).toBe(false);
    expect(endRequestSchema.safeParse({ reason: "because" }).success).toBe(false);
  });
});
