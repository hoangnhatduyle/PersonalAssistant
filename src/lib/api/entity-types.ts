import type { Database } from "@/lib/supabase/types";
import type { MeetingBlock } from "@/lib/calendar/recurrence";

// Row types for every entity a hook fetches/mutates. Kept separate from
// src/lib/knowledge/extraction.ts's own KnowledgeSourceRow (which pulls in
// server-only extraction code alongside it) so client components import a
// module with zero non-type-only side effects.
//
// meeting_blocks is typed as generic Json by the Supabase generator (it
// can't see the app-level shape stored in the jsonb column) — overridden
// here with the precise MeetingBlock[] shape every consumer actually uses.
export type CourseRow = Omit<Database["public"]["Tables"]["courses"]["Row"], "meeting_blocks"> & {
  meeting_blocks: MeetingBlock[];
};
export type DeadlineRow = Database["public"]["Tables"]["deadlines"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
export type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"];
export type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];
export type PersonRow = Database["public"]["Tables"]["people"]["Row"];
export type TodoListRow = Database["public"]["Tables"]["todo_lists"]["Row"];
export type TodoItemRow = Database["public"]["Tables"]["todo_items"]["Row"];

// The knowledge list/detail routes select KNOWLEDGE_SOURCE_PUBLIC_COLUMNS,
// not the full row (raw_content/storage_object_path are deliberately never
// sent to the client) — a dedicated response type instead of the full Row.
export type KnowledgeSourceStatus = Database["public"]["Enums"]["knowledge_source_status"];
export type KnowledgeSourceType = Database["public"]["Enums"]["knowledge_source_type"];
export interface KnowledgeSource {
  id: string;
  source_type: KnowledgeSourceType;
  title: string;
  origin_url: string | null;
  status: KnowledgeSourceStatus;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

// SPEC-API-009 UserPreferencesResponse: no id (singleton per caller, no
// id-addressed route) and updated_at is null when the row has never been
// saved (GET returns column defaults without creating a row).
export interface UserPreferences {
  default_reminder_lead_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  /** IANA time zone name (e.g. "America/Chicago") — the frame of reference for quiet_hours_start/end. */
  timezone: string;
  voice_capture_enabled: boolean;
  /** Whether a Delivered reminder also triggers an email, in addition to in-app. */
  email_reminders_enabled: boolean;
  updated_at: string | null;
}

// Mirrors supabase/migrations/0010_user_preferences.sql's (and
// 0012_reminder_email_delivery.sql's) column DEFAULTs — kept in sync by
// hand (same pattern as this codebase's other hardcoded-but-commented
// constants, e.g. the knowledge retry cap) since a read must never write a
// row just to discover its own defaults (NC-API-USERPREFS-003). Exported
// (not route-local) so supabase/tests/user-preferences.test.ts can assert
// it actually matches the migration's real DEFAULTs — architect-review
// finding: this exact hand-duplication is a drift risk if only informally
// commented.
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  default_reminder_lead_minutes: 60,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "UTC",
  voice_capture_enabled: true,
  email_reminders_enabled: true,
  updated_at: null,
};

export type DeadlineStatus = Database["public"]["Enums"]["deadline_status"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type ReminderStatus = Database["public"]["Enums"]["reminder_status"];
