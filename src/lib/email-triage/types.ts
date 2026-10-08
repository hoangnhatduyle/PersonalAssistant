import { z } from "zod";
import {
  TRIAGE_ACTION_TITLE_MAX_CHARS,
} from "@/lib/email-triage/constants";
import type { MailProvider } from "@/lib/mail/types";

export const TRIAGE_BUCKETS = ["important", "needs_action", "fyi", "ignore"] as const;
export type TriageBucket = (typeof TRIAGE_BUCKETS)[number];

export const TRIAGE_STATUSES = ["open", "dismissed", "acted"] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export const ACTIONABLE_BUCKETS: readonly TriageBucket[] = ["important", "needs_action"];

/**
 * What the model may propose (stage 2). `reminder` is accepted from the model
 * but normalized away: reminders are derived rows with no standalone create,
 * so it becomes a task with a reminder (see normalize-action.ts).
 */
export const RAW_ACTION_KINDS = ["task", "deadline", "event", "reminder"] as const;

/** Stored + offered form of a suggested next step. Never applied without confirmation. */
export const suggestedActionSchema = z.object({
  kind: z.enum(["task", "deadline", "event"]),
  title: z.string().trim().min(1).max(TRIAGE_ACTION_TITLE_MAX_CHARS),
  due_at: z.iso.datetime({ offset: true }).optional(),
  reminders_enabled: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration_minutes: z.number().int().min(1).max(1440).optional(),
  course_id: z.uuid().optional(),
});
export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

/** Client/API shape of a stored triage result (no email body or snippet). */
export interface TriageItem {
  id: string;
  provider: MailProvider;
  messageId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  webLink: string | null;
  bucket: TriageBucket;
  reason: string;
  suggestedAction: SuggestedAction | null;
  status: TriageStatus;
  triagedAt: string;
  expiresAt: string;
}

export interface TriageRunStats {
  /** Unread messages found in range (capped). */
  considered: number;
  /** Newly classified this run. */
  classified: number;
  /** Bodies sent to stage 2 this run. */
  stage2: number;
  /** Already triaged (non-expired) and skipped. */
  skippedAlreadyTriaged: number;
  /** More unread mail exists in range than the per-run cap. */
  truncated: boolean;
}

export type TriageRunOutcome =
  | { status: "ok"; items: TriageItem[]; stats: TriageRunStats }
  | { status: "not_connected" }
  | { status: "needs_reauth" }
  | { status: "rate_limited" };

/** POST /api/mail/triage response body. */
export interface TriageRunResponse {
  connected: boolean;
  needsReauth: boolean;
  items: TriageItem[];
  stats: TriageRunStats | null;
}

/** GET /api/mail/triage response body. */
export interface TriageListResponse {
  items: TriageItem[];
}
