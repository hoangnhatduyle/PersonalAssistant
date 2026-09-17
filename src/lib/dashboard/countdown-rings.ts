import { formatRelativeTime } from "@/lib/format-relative-time";

/**
 * Countdown ring math for UpNextPanel's radial widget. Each ring's fill
 * fraction is normalized against a fixed lookback window rather than the
 * item's own created_at→due_at span, so "more full" always means "more
 * urgent" across items regardless of how long ago each was created — a
 * task created 12 days ago and one created 4 minutes ago read on the same
 * scale.
 */
export const RING_WINDOW_HOURS = 24;
const RING_WINDOW_MS = RING_WINDOW_HOURS * 60 * 60 * 1000;

export function isRingOverdue(at: Date, now: Date): boolean {
  return at.getTime() <= now.getTime();
}

/**
 * 1 = due now or overdue, 0 = due at or beyond the window, linear between.
 * `overdue` defaults to a plain timestamp comparison but accepts an
 * override so callers can defer to a source's own semantic urgency flag
 * (e.g. a Deadline already marked "Overdue" by status) instead of re-deriving it.
 */
export function ringFillFraction(at: Date, now: Date, overdue: boolean = isRingOverdue(at, now)): number {
  if (overdue) return 1;
  const msUntilDue = at.getTime() - now.getTime();
  if (msUntilDue >= RING_WINDOW_MS) return 0;
  return 1 - msUntilDue / RING_WINDOW_MS;
}

/** "PAST DUE" for overdue items, else the standard "in 4m" / "in 6h" relative label. */
export function formatRingCountdown(at: Date, now: Date, overdue: boolean = isRingOverdue(at, now)): string {
  if (overdue) return "PAST DUE";
  return formatRelativeTime(at, now);
}
