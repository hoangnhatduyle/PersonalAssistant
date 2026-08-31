import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { StatusTone } from "@/lib/status-colors";

export interface Suggestion {
  tone: StatusTone;
  message: string;
}

/**
 * Deterministic heuristic over already-fetched Deadlines/Tasks — nearest
 * deadline proximity, not an LLM call of its own. Grounded in real data:
 * no calendar-availability modeling (that needs meeting_pattern parsing,
 * which doesn't exist until the Calendar step), so this only ever claims
 * what it can actually compute from due dates and open-item counts.
 */
export function buildSuggestion(deadlines: DeadlineRow[], tasks: TaskRow[], now: Date = new Date()): Suggestion {
  const overdue = deadlines
    .filter((deadline) => deadline.status === "Overdue")
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  if (overdue.length > 0) {
    const extra = overdue.length > 1 ? ` (+${overdue.length - 1} more overdue)` : "";
    return { tone: "urgent", message: `"${overdue[0].title}" is overdue — tackle it first${extra}.` };
  }

  const upcoming = deadlines
    .filter((deadline) => isOpenDeadline(deadline.status) && new Date(deadline.due_at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  if (upcoming.length > 0) {
    const nearest = upcoming[0];
    const dueAt = new Date(nearest.due_at);
    const hoursUntil = (dueAt.getTime() - now.getTime()) / 3_600_000;

    if (hoursUntil <= 48) {
      return {
        tone: "warn",
        message: `"${nearest.title}" is due ${formatRelativeTime(dueAt, now)} — good time to start if you haven't.`,
      };
    }
    return {
      tone: "ok",
      message: `Nearest deadline is "${nearest.title}", due ${formatRelativeTime(dueAt, now)}. You have room to breathe.`,
    };
  }

  const openTasks = tasks.filter((task) => isOpenTask(task.status));
  if (openTasks.length > 0) {
    return {
      tone: "ok",
      message: `No deadlines on the horizon — ${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} waiting whenever you're ready.`,
    };
  }

  return { tone: "ok", message: "You're all caught up — nothing urgent on deck." };
}
