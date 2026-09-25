/**
 * Rate-limit config for calls this feature makes to Google's/Microsoft's own
 * token or mail-list endpoints (see src/lib/mail/rate-limit.ts). Scoped per
 * provider — dashboard load + manual refresh is the expected traffic, so
 * this only needs to catch abuse, not throttle normal use.
 */
export const MAIL_RATE_LIMIT_MAX = 30;
export const MAIL_RATE_LIMIT_WINDOW_MINUTES = 10;

/**
 * TanStack Query staleTime for the message list and message detail hooks
 * (src/hooks/useMailMessages.ts, src/hooks/useMailMessageDetail.ts). Within
 * this window, remounts/window-refocus/tab-switches reuse the cached
 * response instead of spending another call against checkMailApiRateLimit
 * above — 5 minutes of staleness is an acceptable tradeoff for a personal
 * inbox view, per user request.
 */
export const MAIL_QUERY_STALE_TIME_MS = 5 * 60 * 1000;
