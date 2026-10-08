import { afterEach, describe, expect, it, vi } from "vitest";
import { getMicrosoftMessageDetail, listMicrosoftMessages, searchMicrosoftMessages } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Microsoft Graph mail calls", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function stubFetch(body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("searches the inbox folder with an unread/since filter, ordered by receivedDateTime desc", async () => {
    const fetchMock = stubFetch({ value: [] });

    await searchMicrosoftMessages("at", {
      top: 50,
      folder: "inbox",
      filter: "receivedDateTime ge 2026-10-04T16:00:00Z and isRead eq false",
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.0/me/mailFolders/inbox/messages");
    expect(parsed.searchParams.get("$top")).toBe("50");
    expect(parsed.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-10-04T16:00:00Z and isRead eq false");
    expect(parsed.searchParams.get("$orderby")).toBe("receivedDateTime desc");
  });

  it("uses the whole mailbox and no filter by default (the dashboard list is unchanged)", async () => {
    const fetchMock = stubFetch({ value: [] });
    await listMicrosoftMessages("at");
    const parsed = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(parsed.pathname).toBe("/v1.0/me/messages");
    expect(parsed.searchParams.has("$filter")).toBe(false);
  });

  it("reports truncated when Graph returns an @odata.nextLink", async () => {
    stubFetch({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next" });
    expect((await searchMicrosoftMessages("at", { top: 1 })).truncated).toBe(true);

    stubFetch({ value: [] });
    expect((await searchMicrosoftMessages("at", { top: 1 })).truncated).toBe(false);
  });

  it("asks for immutable ids on list and detail calls so stored triage keys stay valid across folder moves", async () => {
    const listMock = stubFetch({ value: [] });
    await listMicrosoftMessages("at");
    expect((listMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({ Prefer: 'IdType="ImmutableId"' });

    const detailMock = stubFetch({ subject: "s", body: { contentType: "text", content: "hi" } });
    await getMicrosoftMessageDetail("at", "AAMk/+id");
    const [detailUrl, init] = detailMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Prefer: 'IdType="ImmutableId"', Authorization: "Bearer at" });
    expect(detailUrl).toContain(encodeURIComponent("AAMk/+id"));
  });
});
