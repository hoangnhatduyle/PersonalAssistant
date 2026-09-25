export type MailProvider = "google" | "microsoft";

export interface MailMessage {
  id: string;
  provider: MailProvider;
  subject: string;
  from: string;
  snippet: string;
  /** ISO 8601 */
  receivedAt: string;
  isRead: boolean;
  webLink?: string;
}

export interface MailMessageDetail {
  id: string;
  provider: MailProvider;
  subject: string;
  from: string;
  receivedAt: string;
  webLink?: string;
  /** Always sanitized server-side (sanitize-email-html.ts) — never raw. Images blocked to data-original-src by default. */
  sanitizedBodyHtml: string;
}
