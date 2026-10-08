import { TRIAGE_DEFAULT_DAYS, TRIAGE_MAX_DAYS, TRIAGE_MIN_DAYS } from "@/lib/email-triage/constants";

/** Clamps a requested "last N days" range to [1, 30]; missing/NaN falls back to the 7-day default. */
export function clampTriageDays(days: number | null | undefined): number {
  if (days == null || !Number.isFinite(days)) return TRIAGE_DEFAULT_DAYS;
  return Math.min(TRIAGE_MAX_DAYS, Math.max(TRIAGE_MIN_DAYS, Math.round(days)));
}

export function triageSince(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Gmail search (`q`) for unread inbox mail received after `since`. Gmail's `after:` takes epoch seconds. */
export function buildGmailQuery(since: Date): string {
  return `in:inbox is:unread after:${Math.floor(since.getTime() / 1000)}`;
}

/**
 * Graph $filter for unread mail received on/after `since`. receivedDateTime
 * leads because Graph requires $orderby properties to appear first in the
 * filter (the list call orders by receivedDateTime desc). The inbox-only
 * restriction is the folder in the request path, not the filter.
 */
export function buildGraphFilter(since: Date): string {
  const iso = since.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `receivedDateTime ge ${iso} and isRead eq false`;
}
