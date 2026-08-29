import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * SPEC-API-007 AC-11: pre-checks that target_id references a row of
 * target_type owned by the caller, so a bad reference is rejected as a
 * validation error at the route layer (same pattern as notes.ts's
 * ownsNoteLinkTargets) rather than surfacing the DB trigger's raw
 * exception text (SPEC-DATA-010 NC-DATA-013, the backstop this mirrors).
 */
export async function ownsFeedbackTarget(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetType: "deadline" | "task" | "reminder",
  targetId: string,
): Promise<boolean> {
  const table = targetType === "deadline" ? "deadlines" : targetType === "task" ? "tasks" : "reminders";
  const { data } = await supabase.from(table).select("id").eq("id", targetId).eq("user_id", userId).maybeSingle();
  return data !== null;
}
