// Shared ranking + spoken-sentence formatting for the assistant's schedule
// answers. Two-layer design so a factual "what's due" listing
// (runUpcomingScheduleQuery, session.ts) and a priority-aware
// recommendation (general_conversation.ts) can share the same deterministic
// ranking without sharing sentence style.

export type Priority = "Low" | "Medium" | "High" | "Urgent";

export interface ScheduleItem {
  id: string;
  title: string;
  dueAt: Date;
  kind: "deadline" | "task" | "todo";
  /** Raw stored value -- null means genuinely unset, never reported/treated as "Medium" outside ranking comparisons. */
  priority: Priority | null;
}

export interface ScheduleDayGroup {
  /** YYYY-MM-DD in the caller's timezone. */
  dateKey: string;
  /** Sorted by effective priority descending, then dueAt ascending. */
  items: ScheduleItem[];
}

const PRIORITY_RANK: Record<Priority, number> = { Urgent: 4, High: 3, Medium: 2, Low: 1 };

/** NULL is treated as "Medium" for ranking/comparison purposes only -- never mutates or reports the item's stored priority. */
function effectivePriorityRank(priority: Priority | null): number {
  return PRIORITY_RANK[priority ?? "Medium"];
}

function zonedDateKey(date: Date, timeZone: string): string {
  // en-CA's numeric date format is YYYY-MM-DD, which doubles as a
  // directly-sortable string key.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Buckets items into local-calendar-day groups (by `timezone`), ascending by
 * day; within each day, sorts by priority descending (NULL treated as
 * "Medium" for comparison only), then by dueAt ascending as a final
 * tiebreak.
 */
export function rankScheduleItems(items: ScheduleItem[], timezone: string): ScheduleDayGroup[] {
  const byDay = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = zonedDateKey(item.dueAt, timezone);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      byDay.set(key, [item]);
    }
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, dayItems]) => ({
      dateKey,
      items: [...dayItems].sort((a, b) => {
        const rankDiff = effectivePriorityRank(b.priority) - effectivePriorityRank(a.priority);
        return rankDiff !== 0 ? rankDiff : a.dueAt.getTime() - b.dueAt.getTime();
      }),
    }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / DAY_MS);
}

/** "today at 3:00 PM" / "tomorrow at 9:00 AM" / "Friday at 5:00 PM" / "Sep 22 at 5:00 PM", chosen by calendar-day distance from `now`. */
function describeDueTime(date: Date, timezone: string, now: Date): string {
  const dayDiff = daysBetweenDateKeys(zonedDateKey(now, timezone), zonedDateKey(date, timezone));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  if (dayDiff <= 0) return `today at ${time}`;
  if (dayDiff === 1) return `tomorrow at ${time}`;
  if (dayDiff < 7) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(date);
    return `${weekday} at ${time}`;
  }
  const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" }).format(date);
  return `${monthDay} at ${time}`;
}

/** "today" / "tomorrow" / "Friday" / "Sep 22" -- same day-distance rule as describeDueTime, without the time-of-day suffix. */
function describeDueDay(date: Date, timezone: string, now: Date): string {
  return describeDueTime(date, timezone, now).replace(/ at .+$/, "");
}

const ORDINAL_WORDS = ["First", "Secondly", "Thirdly", "Fourthly", "Fifthly"];

function ordinalWord(index: number): string {
  return ORDINAL_WORDS[index] ?? "Next";
}

function joinNaturally(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Flat ordinal walk across every item, in the groups' already-ranked order. Priority silently orders same-day items but is never narrated. */
function buildListingAnswer(flatItems: ScheduleItem[], timezone: string, now: Date): string {
  if (flatItems.length === 1) {
    const [only] = flatItems;
    return `The only item that is due is ${only.title}, due ${describeDueTime(only.dueAt, timezone, now)}.`;
  }

  return flatItems
    .map((item, index) => {
      const timePhrase = describeDueTime(item.dueAt, timezone, now);
      if (index === 0) {
        return `The first item that is due is ${item.title}, due ${timePhrase}.`;
      }
      const isLast = index === flatItems.length - 1;
      const prefix = isLast && flatItems.length > 2 ? "Finally" : ordinalWord(index);
      return `${prefix}, ${item.title} is due ${timePhrase}.`;
    })
    .join(" ");
}

/** Narrates same-day multi-item priority explicitly, then continues into subsequent days when the group set spans more than one. */
function buildRecommendationAnswer(groups: ScheduleDayGroup[], timezone: string, now: Date): string {
  return groups
    .map((group, groupIndex) => {
      const dayPhrase = describeDueDay(group.items[0].dueAt, timezone, now);

      if (group.items.length === 1) {
        const [item] = group.items;
        const timePhrase = describeDueTime(item.dueAt, timezone, now);
        const lead = groupIndex === 0 ? "You have one item due" : "Then, due";
        return `${lead} ${dayPhrase}: ${item.title}, due ${timePhrase}.`;
      }

      const [top, ...rest] = group.items;
      const topLabel = top.priority ?? "Medium";
      const intro =
        groupIndex === 0
          ? `You have ${group.items.length} items due ${dayPhrase}.`
          : `Also, on ${dayPhrase}, you have ${group.items.length} items.`;
      const restDescriptions = joinNaturally(rest.map((item) => `${item.title} (${item.priority ?? "Medium"})`));
      return `${intro} ${top.title} is ${topLabel} priority, so start there. Also due ${dayPhrase}, with lower priority: ${restDescriptions}.`;
    })
    .join(" ");
}

/**
 * "listing": a flat ordinal walk ("First item that is due is X, due today at
 * 3:00 PM. Secondly, ..."). Used by runUpcomingScheduleQuery's factual
 * "what's due" answers.
 * "recommendation": narrates same-day multi-item priority explicitly
 * ("You have N items due today. X is High priority, so start there. Also
 * due today, with lower priority: Y (Medium), and Z (Low)."). Not currently
 * wired into general_conversation's LLM-authored advice (that path pre-sorts
 * with rankScheduleItems and lets the model write prose guided by the
 * ranking, rather than echoing this deterministic template) -- kept here as
 * the tested, deterministic reference implementation of the same-day
 * priority-callout convention.
 */
export function formatScheduleAnswer(
  groups: ScheduleDayGroup[],
  options: { timezone: string; now: Date; style: "listing" | "recommendation"; emptyMessage: string },
): string {
  const flatItems = groups.flatMap((group) => group.items);
  if (flatItems.length === 0) return options.emptyMessage;
  return options.style === "listing"
    ? buildListingAnswer(flatItems, options.timezone, options.now)
    : buildRecommendationAnswer(groups, options.timezone, options.now);
}
