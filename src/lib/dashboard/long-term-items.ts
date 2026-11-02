import type { TaskRow } from "@/lib/api/entity-types";
import { isOpenTask } from "@/lib/dashboard/upcoming-items";
import { lastTouchedAt } from "@/lib/dashboard/stale-items";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LongTermItem {
  id: string;
  title: string;
  href: string;
  /** Most recent of: a real edit, a manual "still on it", or checklist/attachment/note activity. */
  lastTouchedAt: Date;
  /** Whole calendar days since lastTouchedAt (0 = touched today). */
  daysSinceTouched: number;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Open Tasks flagged is_long_term (supabase/migrations/0056_long_term_tasks.sql),
 * longest-untouched first — the card is a passive "keep this on my radar" list,
 * so the thing you've been ignoring longest leads. These never carry a due_at,
 * which is why none of the due-date-driven builders (upcoming-items,
 * workload-density, stale-items) ever see them; this is the one place that does.
 *
 * `taskActivity` is the same optional last-child-activity lookup buildStaleItems
 * takes (checklist item / attachment / linked note), so working on a long-term
 * task's checklist counts as touching it.
 */
export function buildLongTermItems(
  tasks: TaskRow[],
  taskActivity: Map<string, Date> = new Map(),
  now: Date = new Date(),
): LongTermItem[] {
  const todayStart = startOfDay(now);

  return tasks
    .filter((task) => task.is_long_term && isOpenTask(task.status))
    .map((task) => {
      const touchedAt = lastTouchedAt(task.updated_at, task.acknowledged_at, taskActivity.get(task.id) ?? null);
      return {
        id: task.id,
        title: task.title,
        href: `/board/${task.id}`,
        lastTouchedAt: touchedAt,
        daysSinceTouched: Math.max(0, Math.round((todayStart - startOfDay(touchedAt)) / DAY_MS)),
      };
    })
    .sort((a, b) => a.lastTouchedAt.getTime() - b.lastTouchedAt.getTime());
}

/** "touched today" / "touched 1d ago" / "touched 44d ago" — the card's only time signal; deliberately not a due/overdue phrasing. */
export function formatTouchedLabel(daysSinceTouched: number): string {
  return daysSinceTouched === 0 ? "touched today" : `touched ${daysSinceTouched}d ago`;
}
