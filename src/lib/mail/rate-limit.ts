import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MAIL_RATE_LIMIT_MAX, MAIL_RATE_LIMIT_WINDOW_MINUTES } from "@/lib/mail/constants";
import type { MailProvider } from "@/lib/mail/types";

/**
 * Per-user, per-provider cap on calls that reach Google's/Microsoft's own
 * token or mail-list endpoints (GET /api/mail/messages, the OAuth callback
 * routes' code exchange). Mirrors src/lib/voice/rate-limit.ts's
 * checkSpeakRateLimit exactly: counts (and inserts into)
 * 0048_mail_rate_limit.sql's mail_api_requests table, a row this function
 * itself writes on every allowed call — self-referential, so the limit
 * can't be decoupled from calls to the routes it protects (see that file's
 * doc comment for why a naive "count an unrelated table" version is wrong).
 */
export async function checkMailApiRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: MailProvider,
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - MAIL_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await supabase
    .from("mail_api_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("provider", provider)
    .gte("created_at", windowStart);
  if (error) throw error;

  if ((count ?? 0) >= MAIL_RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  const { error: insertError } = await supabase.from("mail_api_requests").insert({ user_id: userId, provider });
  if (insertError) throw insertError;

  return { allowed: true };
}
