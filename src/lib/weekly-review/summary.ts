import type { WeeklyReviewData } from "@/lib/weekly-review/types";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Plain-text, speech-safe recap built straight from the numbers: weekday
 * names and day counts, never an ISO date. It is the voice tool's answer
 * body and the card's narrative when the LLM is unavailable.
 */
export function buildPlainSummary(data: WeeklyReviewData): string {
  const { lastWeek, pending, nextWeek } = data;
  const sentences: string[] = [];

  if (lastWeek.completedCount === 0 && lastWeek.dueCount === 0) {
    sentences.push("Over the past 7 days nothing was due and nothing was completed.");
  } else {
    let sentence = `Over the past 7 days you completed ${plural(lastWeek.completedCount, "item")}`;
    if (lastWeek.dueCount > 0) {
      const doneOfDue = lastWeek.dueCount - lastWeek.stillOpen;
      sentence += `. Of the ${lastWeek.dueCount} that came due, ${doneOfDue} ${doneOfDue === 1 ? "is" : "are"} done`;
      if (lastWeek.onTimeRate !== null) sentence += `, ${lastWeek.onTimeRate}% of those on time`;
    }
    sentences.push(`${sentence}.`);
  }
  if (lastWeek.sessions.done > 0 || lastWeek.sessions.skipped > 0) {
    const skipped = lastWeek.sessions.skipped > 0 ? `, and skipped ${lastWeek.sessions.skipped}` : "";
    sentences.push(`You finished ${plural(lastWeek.sessions.done, "study session")}${skipped}.`);
  }

  const oldest = pending.pastDueItems[0];
  if (oldest) {
    sentences.push(
      `${plural(pending.pastDueCount, "item")} ${pending.pastDueCount === 1 ? "is" : "are"} past due. The oldest is "${oldest.title}", ${plural(oldest.daysOverdue, "day")} overdue.`,
    );
  } else {
    sentences.push("Nothing is past due.");
  }
  if (pending.dueTodayCount > 0) sentences.push(`${plural(pending.dueTodayCount, "item")} ${pending.dueTodayCount === 1 ? "is" : "are"} due today.`);

  if (nextWeek.total === 0) {
    sentences.push("Next week is clear.");
  } else {
    const busiest = nextWeek.busiestDay;
    sentences.push(
      `Next week you have ${plural(nextWeek.total, "item")} due${busiest ? `, with ${busiest.weekday} the busiest at ${busiest.total}` : ""}.`,
    );
  }

  return sentences.join(" ");
}
