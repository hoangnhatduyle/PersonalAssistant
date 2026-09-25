import { afterEach, describe, expect, it, vi } from "vitest";
import { getGoogleMessageDetail, listGoogleMessages } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listGoogleMessages", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists ids then fetches metadata per message, normalizing to MailMessage", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/messages?")) {
        return Promise.resolve(jsonResponse({ messages: [{ id: "msg-1" }, { id: "msg-2" }] }));
      }
      if (url.includes("/messages/msg-1")) {
        return Promise.resolve(
          jsonResponse({
            id: "msg-1",
            snippet: "Hello there",
            internalDate: "1700000000000",
            labelIds: ["INBOX", "UNREAD"],
            payload: { headers: [{ name: "Subject", value: "Hi" }, { name: "From", value: "a@x.com" }] },
          }),
        );
      }
      if (url.includes("/messages/msg-2")) {
        return Promise.resolve(
          jsonResponse({
            id: "msg-2",
            snippet: "Second message",
            internalDate: "1700000100000",
            labelIds: ["INBOX"],
            payload: { headers: [{ name: "Subject", value: "Second" }, { name: "From", value: "b@x.com" }] },
          }),
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const messages = await listGoogleMessages("at", 20);

    expect(messages).toHaveLength(2);
    // Sorted newest first — msg-2 has the later internalDate.
    expect(messages[0].id).toBe("msg-2");
    expect(messages[0].isRead).toBe(true);
    expect(messages[1].id).toBe("msg-1");
    expect(messages[1].isRead).toBe(false);
    expect(messages[1].subject).toBe("Hi");
    expect(messages[1].from).toBe("a@x.com");
  });

  it("returns an empty array when there are no messages", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
    await expect(listGoogleMessages("at")).resolves.toEqual([]);
  });

  it("throws when the Gmail API returns a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(listGoogleMessages("at")).rejects.toThrow(/500/);
  });
});

function base64url(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64url");
}

describe("getGoogleMessageDetail", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("walks nested multipart/alternative inside multipart/mixed to find html and text parts, plus header metadata", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        internalDate: "1700000000000",
        payload: {
          mimeType: "multipart/mixed",
          headers: [{ name: "Subject", value: "Hi" }, { name: "From", value: "a@x.com" }],
          parts: [
            {
              mimeType: "multipart/alternative",
              parts: [
                { mimeType: "text/plain", body: { data: base64url("Hello plain") } },
                { mimeType: "text/html", body: { data: base64url("<p>Hello html</p>") } },
              ],
            },
            { mimeType: "application/pdf", body: { data: base64url("binary") } },
          ],
        },
      }),
    ) as unknown as typeof fetch;

    const detail = await getGoogleMessageDetail("at", "msg-1");

    expect(detail.html).toBe("<p>Hello html</p>");
    expect(detail.text).toBe("Hello plain");
    expect(detail.subject).toBe("Hi");
    expect(detail.from).toBe("a@x.com");
    expect(detail.webLink).toBe("https://mail.google.com/mail/u/0/#inbox/msg-1");
  });

  it("returns nulls when no html or text part exists, and defaults subject when headers are missing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ payload: { mimeType: "application/pdf", body: { data: base64url("binary") } } }),
    ) as unknown as typeof fetch;

    const detail = await getGoogleMessageDetail("at", "msg-1");
    expect(detail.html).toBeNull();
    expect(detail.text).toBeNull();
    expect(detail.subject).toBe("(no subject)");
  });

  it("decodes a flat (non-multipart) html body", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ payload: { mimeType: "text/html", body: { data: base64url("<p>Flat</p>") } } }),
    ) as unknown as typeof fetch;

    const detail = await getGoogleMessageDetail("at", "msg-1");
    expect(detail.html).toBe("<p>Flat</p>");
    expect(detail.text).toBeNull();
  });
});
