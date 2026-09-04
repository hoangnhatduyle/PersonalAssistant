import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildSessionProgress } from "@/lib/deadlines/session-progress";

export interface DeadlineProgressLookupResult {
  message: string;
}

export interface DeadlineProgressLookupFn {
  (supabase: SupabaseClient<Database>, userId: string, deadlineId: string): Promise<DeadlineProgressLookupResult>;
}

/**
 * Backs the "get_deadline_progress" voice tool (src/lib/voice/tools.ts) —
 * read-only progress awareness only, no voice-driven session creation.
 * Scoped by user_id like every other lookup helper (runSuggestionsLookup,
 * loadSchedule); deadlineId itself is validated against the caller's own
 * entity context by conversation-core.ts before this ever runs, so this is
 * defense in depth, not the only gate.
 */
export const runDeadlineProgressLookup: DeadlineProgressLookupFn = async (supabase, userId, deadlineId) => {
  const [{ data: deadline }, { data: sessions }] = await Promise.all([
    supabase.from("deadlines").select("title").eq("id", deadlineId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase.from("appointments").select("*").eq("deadline_id", deadlineId).eq("user_id", userId).is("deleted_at", null),
  ]);

  if (!deadline) return { message: "I couldn't find that deadline." };

  const progress = buildSessionProgress(sessions ?? [])[0];
  if (!progress || progress.total === 0) {
    return { message: `No sessions are planned yet for ${deadline.title}.` };
  }

  const remaining = progress.total - progress.done;
  const skipped = (sessions ?? []).filter((session) => session.session_status === "skipped").length;

  if (remaining === 0) {
    return { message: `You've completed all ${progress.total} session${progress.total === 1 ? "" : "s"} for ${deadline.title}.` };
  }

  const remainingClause =
    skipped > 0 ? `${remaining} left, including ${skipped} skipped` : `${remaining} left`;
  return {
    message: `You've completed ${progress.done} of ${progress.total} sessions for ${deadline.title} — ${remainingClause}.`,
  };
};
