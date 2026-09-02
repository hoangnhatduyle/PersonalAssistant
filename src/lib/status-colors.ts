import type { Database } from "@/lib/supabase/types";

export type StatusTone = "ok" | "warn" | "urgent" | "neutral" | "accent";

const TONE_CLASSES: Record<StatusTone, string> = {
  ok: "bg-status-ok/15 text-status-ok border-status-ok/30",
  warn: "bg-status-warn/15 text-status-warn border-status-warn/30",
  urgent: "bg-status-urgent/15 text-status-urgent border-status-urgent/30",
  neutral: "bg-status-neutral/15 text-status-neutral border-status-neutral/30",
  accent: "bg-accent-indigo/15 text-accent-indigo border-accent-indigo/30",
};

export function toneClasses(tone: StatusTone): string {
  return TONE_CLASSES[tone];
}

// Solid fills for progress bars/meters, distinct from TONE_CLASSES's
// translucent badge backgrounds — a badge and a progress bar need opposite
// contrast (text-on-transparent vs. a filled track).
const TONE_BAR_CLASSES: Record<StatusTone, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  urgent: "bg-status-urgent",
  neutral: "bg-status-neutral",
  accent: "bg-accent-indigo",
};

export function toneBarClasses(tone: StatusTone): string {
  return TONE_BAR_CLASSES[tone];
}

type DeadlineStatus = Database["public"]["Enums"]["deadline_status"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type ReminderStatus = Database["public"]["Enums"]["reminder_status"];
type KnowledgeSourceStatus = Database["public"]["Enums"]["knowledge_source_status"];

export const DEADLINE_STATUS_TONE: Record<DeadlineStatus, StatusTone> = {
  "Not Started": "neutral",
  "In Progress": "accent",
  Submitted: "warn",
  Overdue: "urgent",
  Completed: "ok",
  Cancelled: "neutral",
};

export const TASK_STATUS_TONE: Record<TaskStatus, StatusTone> = {
  Open: "accent",
  Done: "ok",
  Cancelled: "neutral",
};

export const REMINDER_STATUS_TONE: Record<ReminderStatus, StatusTone> = {
  Scheduled: "neutral",
  Delivered: "warn",
  Acknowledged: "ok",
  Dismissed: "neutral",
  Snoozed: "accent",
  Expired: "neutral",
};

export const KNOWLEDGE_STATUS_TONE: Record<KnowledgeSourceStatus, StatusTone> = {
  Pending: "warn",
  Processing: "warn",
  Ready: "ok",
  Failed: "urgent",
};
