import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { SPEAK_RATE_LIMIT_MAX, SPEAK_RATE_LIMIT_WINDOW_MINUTES } from "@/lib/voice/constants";

/**
 * SPEC-API-010 NC-API-SPEAK-003: per-user cap on POST /api/voice/speak.
 *
 * Security/architect-review finding: an earlier version of this counted
 * voice_sessions rows (mirroring src/lib/knowledge/rate-limit.ts's
 * checkCreateRateLimit) — but that only works for the knowledge route
 * because POST /api/knowledge inserts the very row being counted, so every
 * allowed request advances its own counter. POST /api/voice/speak never
 * writes to voice_sessions, so that version left the limit entirely
 * decoupled from calls to this route: a caller could invoke it an
 * unbounded number of times (each a paid ElevenLabs/OpenAI call) as long
 * as they'd made at least one real voice turn recently.
 *
 * This version restores the self-referential property directly: it counts
 * (and inserts into) 0011_voice_speak_rate_limit.sql's
 * voice_speak_requests table, a row this function itself writes on every
 * allowed call. Still a plain check-then-insert (not a single atomic
 * statement), so two concurrent requests can theoretically both read the
 * same under-limit count before either inserts — the same non-atomicity
 * checkCreateRateLimit already accepts; not upgraded to a stricter
 * primitive here for the same reason.
 */
export async function checkSpeakRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - SPEAK_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await supabase
    .from("voice_speak_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (error) throw error;

  if ((count ?? 0) >= SPEAK_RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  const { error: insertError } = await supabase.from("voice_speak_requests").insert({ user_id: userId });
  if (insertError) throw insertError;

  return { allowed: true };
}
