import { afterEach, describe, expect, it, vi } from "vitest";
import { searchGoogleMessages } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("searchGoogleMessages", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function stubFetch(list: unknown) {
    const urls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      urls.push(url);
      if (url.includes("/messages?")) return Promise.resolve(jsonResponse(list));
      return Promise.resolve(
        jsonResponse({
          id: "msg-1",
          snippet: "Hello",
          internalDate: "1700000000000",
          labelIds: ["INBOX", "UNREAD"],
          payload: { headers: [{ name: "Subject", value: "Hi" }, { name: "From", value: "a@x.com" }] },
        }),
      );
    }) as unknown as typeof fetch;
    return urls;
  }

  it("passes the search query, label ids and max results to the list call", async () => {
    const urls = stubFetch({ messages: [{ id: "msg-1" }] });

    await searchGoogleMessages("at", { maxResults: 50, query: "in:inbox is:unread after:1700000000", labelIds: ["INBOX"] });

    const listUrl = new URL(urls[0]);
    expect(listUrl.searchParams.get("maxResults")).toBe("50");
    expect(listUrl.searchParams.get("q")).toBe("in:inbox is:unread after:1700000000");
    expect(listUrl.searchParams.getAll("labelIds")).toEqual(["INBOX"]);
  });

  it("omits q and labelIds when not given", async () => {
    const urls = stubFetch({ messages: [{ id: "msg-1" }] });
    await searchGoogleMessages("at", { maxResults: 5 });
    const listUrl = new URL(urls[0]);
    expect(listUrl.searchParams.has("q")).toBe(false);
    expect(listUrl.searchParams.has("labelIds")).toBe(false);
  });

  it("reports truncated when Gmail returns a next page token, not otherwise", async () => {
    stubFetch({ messages: [{ id: "msg-1" }], nextPageToken: "abc" });
    expect((await searchGoogleMessages("at", { maxResults: 1 })).truncated).toBe(true);

    stubFetch({ messages: [{ id: "msg-1" }] });
    const result = await searchGoogleMessages("at", { maxResults: 1 });
    expect(result.truncated).toBe(false);
    expect(result.messages[0]).toMatchObject({ id: "msg-1", isRead: false, subject: "Hi" });
  });
});
