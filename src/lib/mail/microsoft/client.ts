import type { MailMessage } from "@/lib/mail/types";

const DEFAULT_TOP = 20;

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  webLink?: string;
}

interface GraphMessagesResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

interface GraphMessageDetailResponse {
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  webLink?: string;
  body?: { contentType?: "html" | "text"; content?: string };
}

function formatFrom(from: GraphMessage["from"]): string {
  const address = from?.emailAddress;
  if (!address) return "";
  return address.name ? `${address.name} <${address.address ?? ""}>` : (address.address ?? "");
}

/**
 * Graph message ids are mutable by default (they change when a message moves
 * folders). Asking for immutable ids on every call keeps ids stable, which
 * stored triage results rely on. List and detail calls must agree: an id of
 * one type is not accepted by a request of the other.
 */
const IMMUTABLE_ID_HEADERS = { Prefer: 'IdType="ImmutableId"' } as const;

export interface MicrosoftSearchOptions {
  top: number;
  /** OData $filter. When it constrains receivedDateTime it must list that property first (Graph requires $orderby properties to lead the filter). */
  filter?: string;
  /** Well-known folder name ("inbox"); omitted = the whole mailbox. */
  folder?: string;
}

export interface MicrosoftSearchResult {
  messages: MailMessage[];
  /** True when Graph returned an @odata.nextLink (more matches than `top`). */
  truncated: boolean;
}

/** Lists recent messages from the connected (personal Outlook.com) mailbox via Microsoft Graph — one call returns everything needed, no per-message fetch. */
export async function listMicrosoftMessages(
  accessToken: string,
  top: number = DEFAULT_TOP,
): Promise<MailMessage[]> {
  return (await searchMicrosoftMessages(accessToken, { top })).messages;
}

/** Filtered variant of listMicrosoftMessages (unread / since-date / folder), also reporting whether more matches exist beyond `top`. */
export async function searchMicrosoftMessages(
  accessToken: string,
  { top, filter, folder }: MicrosoftSearchOptions,
): Promise<MicrosoftSearchResult> {
  const params = new URLSearchParams({
    $top: String(top),
    $select: "subject,from,receivedDateTime,bodyPreview,isRead,webLink",
    $orderby: "receivedDateTime desc",
  });
  if (filter) params.set("$filter", filter);
  const base = folder
    ? `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(folder)}/messages`
    : "https://graph.microsoft.com/v1.0/me/messages";
  const response = await fetch(`${base}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, ...IMMUTABLE_ID_HEADERS },
  });
  if (!response.ok) {
    throw new Error(`Microsoft Graph messages endpoint returned ${response.status}: ${await response.text()}`);
  }
  const data: GraphMessagesResponse = await response.json();

  const messages = data.value.map((message): MailMessage => ({
    id: message.id,
    provider: "microsoft",
    subject: message.subject || "(no subject)",
    from: formatFrom(message.from),
    snippet: message.bodyPreview ?? "",
    receivedAt: message.receivedDateTime ?? new Date(0).toISOString(),
    isRead: message.isRead ?? true,
    webLink: message.webLink,
  }));
  return { messages, truncated: Boolean(data["@odata.nextLink"]) };
}

export interface MicrosoftMessageDetail {
  subject: string;
  from: string;
  /** ISO 8601 */
  receivedAt: string;
  webLink?: string;
  html: string | null;
  text: string | null;
}

/** Fetches one message's full body plus header metadata via Microsoft Graph in a single call. Graph returns body: { contentType, content } directly — no MIME parsing needed, much simpler than Gmail. */
export async function getMicrosoftMessageDetail(
  accessToken: string,
  messageId: string,
): Promise<MicrosoftMessageDetail> {
  const params = new URLSearchParams({ $select: "subject,from,receivedDateTime,isRead,webLink,body" });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}`, ...IMMUTABLE_ID_HEADERS } },
  );
  if (!response.ok) {
    throw new Error(`Microsoft Graph message detail endpoint returned ${response.status}: ${await response.text()}`);
  }
  const data: GraphMessageDetailResponse = await response.json();

  const content = data.body?.content ?? null;
  const isHtml = data.body?.contentType === "html";

  return {
    subject: data.subject || "(no subject)",
    from: formatFrom(data.from),
    receivedAt: data.receivedDateTime ?? new Date(0).toISOString(),
    webLink: data.webLink,
    html: content && isHtml ? content : null,
    text: content && !isHtml ? content : null,
  };
}
