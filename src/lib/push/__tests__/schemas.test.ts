import { describe, expect, it } from "vitest";
import { pushSubscribeBodySchema, pushUnsubscribeBodySchema } from "../schemas";

const valid = { endpoint: "https://web.push.apple.com/abc123", keys: { p256dh: "BNc…", auth: "xyz" } };

describe("pushSubscribeBodySchema", () => {
  it("accepts a PushSubscription.toJSON() shape (extra fields such as expirationTime are ignored)", () => {
    expect(pushSubscribeBodySchema.safeParse({ ...valid, expirationTime: null }).success).toBe(true);
  });

  it.each([
    ["a non-https endpoint", { ...valid, endpoint: "http://push.example.com/abc" }],
    ["a non-URL endpoint", { ...valid, endpoint: "not a url" }],
    ["an over-long endpoint", { ...valid, endpoint: `https://push.example.com/${"a".repeat(2100)}` }],
    ["missing keys", { endpoint: valid.endpoint }],
    ["an empty auth secret", { ...valid, keys: { p256dh: "k", auth: "" } }],
    ["a missing body", null],
  ])("rejects %s", (_label, body) => {
    expect(pushSubscribeBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("pushUnsubscribeBodySchema", () => {
  it("requires a non-empty endpoint", () => {
    expect(pushUnsubscribeBodySchema.safeParse({ endpoint: valid.endpoint }).success).toBe(true);
    expect(pushUnsubscribeBodySchema.safeParse({ endpoint: "" }).success).toBe(false);
    expect(pushUnsubscribeBodySchema.safeParse({}).success).toBe(false);
  });
});
