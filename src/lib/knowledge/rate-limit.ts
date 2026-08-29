import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { KNOWLEDGE_CREATE_RATE_LIMIT_MAX, KNOWLEDGE_CREATE_RATE_LIMIT_WINDOW_MINUTES } from "@/lib/knowledge/constants";

/**
 * SPEC-API-008 NC-API-018: per-user cap on the create route, distinct from
 * the general per-route rate limiting SPEC-API-007 NC-API-005 requires —
 * this route fans out to paid OpenAI/Deepgram calls per request. No
 * dedicated rate-limit infra exists in this codebase yet (SPEC-API-007
 * explicitly deferred it), so this counts the caller's own recent
 * knowledge_sources rows via the existing knowledge_sources_user_id_idx
 * rather than standing up a new store — see the Phase 2 plan's "rate
 * limiting" design note.
 */
export async function checkCreateRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - KNOWLEDGE_CREATE_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await supabase
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (error) throw error;

  return { allowed: (count ?? 0) < KNOWLEDGE_CREATE_RATE_LIMIT_MAX };
}
