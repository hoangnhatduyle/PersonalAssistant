import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildSessionProgress } from "@/lib/deadlines/session-progress";
import { formatEstimateHours } from "@/lib/progress/format";
import { resolveDeadlineProgress } from "@/lib/progress/resolve-progress";

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
    supabase.from("deadlines").select("title, status, estimated_hours, progress_percent, progress_note").eq("id", deadlineId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase.from("appointments").select("*").eq("deadline_id", deadlineId).eq("user_id", userId).is("deleted_at", null),
  ]);

  if (!deadline) return { message: "I couldn't find that deadline." };

  const progress = buildSessionProgress(sessions ?? [])[0];
  const resolved = resolveDeadlineProgress({ id: deadlineId, ...deadline }, sessions ?? []);

  // The session count first (as before), then what the user has told the app about the work itself.
  // The percent is only repeated when it adds something: a hand-set value, or one measured against an estimate.
  const sentences = [describeSessions(deadline.title, progress, sessions ?? [])];
  if (resolved.source === "manual") sentences.push(`It's about ${resolved.percent}% done, as you set it.`);
  else if (resolved.source === "session-time") sentences.push(`Against your ${formatEstimateHours(deadline.estimated_hours)} estimate, that's about ${resolved.percent}% done.`);
  if (deadline.estimated_hours != null && resolved.source !== "session-time") sentences.push(`Your estimate is ${formatEstimateHours(deadline.estimated_hours)}.`);
  if (resolved.note) sentences.push(`Note: ${resolved.note}`);

  return { message: sentences.join(" ") };
};

function describeSessions(
  title: string,
  progress: ReturnType<typeof buildSessionProgress>[number] | undefined,
  sessions: Array<{ session_status: string | null }>,
): string {
  if (!progress || progress.total === 0) return `No sessions are planned yet for ${title}.`;

  const remaining = progress.total - progress.done;
  const skipped = sessions.filter((session) => session.session_status === "skipped").length;

  if (remaining === 0) {
    return `You've completed all ${progress.total} session${progress.total === 1 ? "" : "s"} for ${title}.`;
  }

  const remainingClause = skipped > 0 ? `${remaining} left, including ${skipped} skipped` : `${remaining} left`;
  return `You've completed ${progress.done} of ${progress.total} sessions for ${title} — ${remainingClause}.`;
}
