import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { generateSuggestionsForUser } from "@/lib/personalization/generate-for-user";

export interface SuggestionsLookupResult {
  message: string;
}

export interface SuggestionsLookupFn {
  (supabase: SupabaseClient<Database>, userId: string): Promise<SuggestionsLookupResult>;
}

/**
 * Backs the "personalization_suggestions" voice queryKind (src/lib/voice/
 * session.ts) — runs the same on-demand generation the dashboard's "Check
 * for suggestions" button triggers, then reports a short spoken count.
 * Detailed per-suggestion rationale is deliberately NOT spoken here — that
 * happens client-side in the review-aloud loop (src/hooks/
 * useReviewSuggestionsAloud.ts), which the client kicks off after seeing
 * this queryKind on a "responded" turn, keeping this response the same
 * "one concise message" shape as upcoming_schedule/knowledge_lookup.
 */
export const runSuggestionsLookup: SuggestionsLookupFn = async (supabase, userId) => {
  await generateSuggestionsForUser(supabase, userId);

  const { count } = await supabase
    .from("personalization_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  const pendingCount = count ?? 0;
  if (pendingCount === 0) return { message: "No new suggestions right now." };
  return { message: `You have ${pendingCount} suggestion${pendingCount === 1 ? "" : "s"}.` };
};
