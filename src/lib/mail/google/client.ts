import type { MailMessage } from "@/lib/mail/types";

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const DEFAULT_MAX_RESULTS = 20;

interface GmailListResponse {
  messages?: Array<{ id: string }>;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageResponse {
  id: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessageDetailResponse {
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
}

/** Recursively walks payload/parts (handles multipart/alternative nested inside multipart/mixed) for the first part matching mimeType. */
function findPart(part: GmailMessagePart | undefined, mimeType: string): GmailMessagePart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function gmailGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Gmail API returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/** Lists recent Gmail messages, normalized to MailMessage. One list call + one metadata GET per message id (Gmail has no batch-fetch-with-headers in a single REST call). */
export async function listGoogleMessages(
  accessToken: string,
  maxResults: number = DEFAULT_MAX_RESULTS,
): Promise<MailMessage[]> {
  const list = await gmailGet<GmailListResponse>(`/messages?maxResults=${maxResults}`, accessToken);
  const ids = list.messages ?? [];

  const messages = await Promise.all(
    ids.map((item) =>
      gmailGet<GmailMessageResponse>(
        `/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        accessToken,
      ),
    ),
  );

  return messages
    .map((message): MailMessage => {
      const headers = message.payload?.headers;
      return {
        id: message.id,
        provider: "google",
        subject: headerValue(headers, "Subject") || "(no subject)",
        from: headerValue(headers, "From"),
        snippet: message.snippet ?? "",
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : new Date(0).toISOString(),
        isRead: !(message.labelIds ?? []).includes("UNREAD"),
        webLink: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
      };
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export interface GoogleMessageDetail {
  subject: string;
  from: string;
  /** ISO 8601 */
  receivedAt: string;
  webLink: string;
  html: string | null;
  text: string | null;
}

/**
 * Fetches one message's full body plus the same header metadata already
 * shown in the list (format=full returns payload.headers alongside the
 * MIME parts, so this is one call, not a separate metadata fetch). Gmail's
 * API base64url-encodes part data regardless of the original
 * transfer-encoding, so no separate quoted-printable handling is needed.
 */
export async function getGoogleMessageDetail(accessToken: string, messageId: string): Promise<GoogleMessageDetail> {
  const message = await gmailGet<GmailMessageDetailResponse>(
    `/messages/${encodeURIComponent(messageId)}?format=full`,
    accessToken,
  );

  const htmlPart = findPart(message.payload, "text/html");
  const textPart = findPart(message.payload, "text/plain");
  const headers = message.payload?.headers;

  return {
    subject: headerValue(headers, "Subject") || "(no subject)",
    from: headerValue(headers, "From"),
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date(0).toISOString(),
    webLink: `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
    html: htmlPart?.body?.data ? decodeBase64Url(htmlPart.body.data) : null,
    text: textPart?.body?.data ? decodeBase64Url(textPart.body.data) : null,
  };
}
