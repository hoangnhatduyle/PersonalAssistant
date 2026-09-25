import { afterEach, describe, expect, it, vi } from "vitest";
import { getMicrosoftMessageDetail, listMicrosoftMessages } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listMicrosoftMessages", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes Graph messages to MailMessage in one call", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: "m1",
            subject: "Hello",
            from: { emailAddress: { name: "Alice", address: "alice@outlook.com" } },
            receivedDateTime: "2026-09-24T12:00:00Z",
            bodyPreview: "Hi there",
            isRead: false,
            webLink: "https://outlook.live.com/mail/m1",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const messages = await listMicrosoftMessages("at");

    expect(messages).toEqual([
      {
        id: "m1",
        provider: "microsoft",
        subject: "Hello",
        from: "Alice <alice@outlook.com>",
        snippet: "Hi there",
        receivedAt: "2026-09-24T12:00:00Z",
        isRead: false,
        webLink: "https://outlook.live.com/mail/m1",
      },
    ]);
  });

  it("defaults subject and marks message read when the API omits isRead", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ value: [{ id: "m2", from: {}, receivedDateTime: "2026-09-24T00:00:00Z" }] }),
    ) as unknown as typeof fetch;

    const [message] = await listMicrosoftMessages("at");
    expect(message.subject).toBe("(no subject)");
    expect(message.isRead).toBe(true);
    expect(message.from).toBe("");
  });

  it("throws when Graph returns a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(listMicrosoftMessages("at")).rejects.toThrow(/401/);
  });
});

describe("getMicrosoftMessageDetail", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps an html body directly with no MIME parsing, plus header metadata", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        subject: "Hello",
        from: { emailAddress: { name: "Alice", address: "alice@outlook.com" } },
        receivedDateTime: "2026-09-24T12:00:00Z",
        webLink: "https://outlook.live.com/mail/m1",
        body: { contentType: "html", content: "<p>Hello</p>" },
      }),
    ) as unknown as typeof fetch;

    const detail = await getMicrosoftMessageDetail("at", "m1");
    expect(detail).toEqual({
      subject: "Hello",
      from: "Alice <alice@outlook.com>",
      receivedAt: "2026-09-24T12:00:00Z",
      webLink: "https://outlook.live.com/mail/m1",
      html: "<p>Hello</p>",
      text: null,
    });
  });

  it("maps a text body to the text field and defaults subject when missing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ body: { contentType: "text", content: "Plain body" } }),
    ) as unknown as typeof fetch;

    const detail = await getMicrosoftMessageDetail("at", "m1");
    expect(detail.html).toBeNull();
    expect(detail.text).toBe("Plain body");
    expect(detail.subject).toBe("(no subject)");
    expect(detail.from).toBe("");
  });

  it("throws when Graph returns a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(getMicrosoftMessageDetail("at", "m1")).rejects.toThrow(/404/);
  });
});
