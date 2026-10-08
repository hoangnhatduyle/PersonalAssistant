import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { TRIAGE_RUN_LIMIT_MAX, TRIAGE_RUN_LIMIT_WINDOW_MINUTES } from "@/lib/email-triage/constants";
import type { MailProvider } from "@/lib/mail/types";

/**
 * Per-user cap on triage runs (each spends OpenAI + provider calls). Same
 * self-referential design as checkMailApiRateLimit (src/lib/mail/rate-limit.ts):
 * counts, and on success inserts, mail_triage_runs rows (0053), kept separate
 * from mail_api_requests so a triage run can't starve the dashboard inbox.
 */
export async function checkTriageRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: MailProvider,
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - TRIAGE_RUN_LIMIT_WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await supabase
    .from("mail_triage_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (error) throw error;

  if ((count ?? 0) >= TRIAGE_RUN_LIMIT_MAX) return { allowed: false };

  const { error: insertError } = await supabase.from("mail_triage_runs").insert({ user_id: userId, provider });
  if (insertError) throw insertError;

  return { allowed: true };
}
