import { formatRelativeTime } from "@/lib/format-relative-time";
import type { PushPayload } from "@/lib/push/send-push";

export interface ReminderPushInput {
  reminderId: string;
  targetType: "task" | "deadline";
  targetId: string;
  title: string;
  dueAt: string;
  /** Deadline-kind only -- its parent course's name. */
  courseName?: string | null;
  now?: Date;
}

// A lock-screen notification shows roughly two lines; a very long title just
// gets cut by the OS, but trimming here keeps the payload small and the cut
// at a word-ish boundary we control.
const MAX_TITLE_CHARS = 90;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Builds the notification for one delivered reminder. The deep link is
 * app-relative on purpose: the service worker resolves it against its own
 * origin, so unlike the email (which needs REMINDER_EMAIL_URL) this never
 * depends on a base-URL env var. Routes match send-reminder-emails'.
 */
export function buildReminderPushPayload(input: ReminderPushInput): PushPayload {
  const due = formatRelativeTime(new Date(input.dueAt), input.now ?? new Date());
  const kind = input.targetType === "task" ? "Task" : "Deadline";
  const parts = [input.courseName ? `${input.courseName} · ${kind.toLowerCase()}` : kind, `due ${due}`];

  return {
    title: truncate(input.title, MAX_TITLE_CHARS),
    body: parts.join(" · "),
    url: input.targetType === "task" ? `/board/${input.targetId}` : `/courses/deadlines/${input.targetId}`,
    tag: `reminder-${input.reminderId}`,
  };
}
