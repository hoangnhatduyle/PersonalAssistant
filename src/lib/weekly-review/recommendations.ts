import type { WeeklyReviewData } from "@/lib/weekly-review/types";

const MAX_RECOMMENDATIONS = 2;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Rule-based, so the card and the voice answer always agree. Highest
 * priority first, capped at two: what is already slipping, then what is
 * about to without any prep, then a pile-up day.
 */
export function buildRecommendations(data: WeeklyReviewData): string[] {
  const picks: string[] = [];

  const oldestPastDue = data.pending.pastDueItems[0];
  if (oldestPastDue) {
    picks.push(`Clear or reschedule ${plural(data.pending.pastDueCount, "past-due item")}, starting with "${oldestPastDue.title}".`);
  }

  const unplanned = data.nextWeek.deadlinesWithoutSessions[0];
  if (unplanned) {
    picks.push(`Plan study sessions for "${unplanned.title}" before it's due ${unplanned.weekday}; none are scheduled yet.`);
  }

  const pileUp = data.nextWeek.collisionDays.reduce<(typeof data.nextWeek.collisionDays)[number] | null>(
    (best, day) => (day.total > (best?.total ?? 0) ? day : best),
    null,
  );
  if (pileUp) {
    picks.push(`${pileUp.weekday} has ${pileUp.total} items due, so start "${pileUp.titles[0]}" a day or two early.`);
  }

  if (picks.length === 0) {
    picks.push(
      data.nextWeek.total === 0
        ? "Nothing is due next week, so it's a good window to get ahead on longer-term work."
        : "Next week looks manageable. Keep your current pace.",
    );
  }

  return picks.slice(0, MAX_RECOMMENDATIONS);
}
