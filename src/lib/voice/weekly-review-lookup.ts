import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { computeWeeklyReview } from "@/lib/weekly-review/compute-weekly-review";
import { buildPlainSummary } from "@/lib/weekly-review/summary";

export interface WeeklyReviewLookupResult {
  message: string;
}

export interface WeeklyReviewLookupFn {
  (supabase: SupabaseClient<Database>, userId: string, now?: Date): Promise<WeeklyReviewLookupResult>;
}

/**
 * Backs the "get_weekly_review" voice tool (src/lib/voice/tools.ts). Same
 * computation as the dashboard's Weekly Review card, so the two always agree;
 * the message is already speech-safe (weekday names and counts, no ISO dates)
 * and ends with the same rule-based recommendations the card shows.
 */
export const runWeeklyReviewLookup: WeeklyReviewLookupFn = async (supabase, userId, now = new Date()) => {
  const { data, recommendations } = await computeWeeklyReview(supabase, userId, now);
  return { message: [buildPlainSummary(data), ...recommendations].join(" ") };
};
