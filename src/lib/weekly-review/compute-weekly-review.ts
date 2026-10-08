import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadUserTimezone } from "@/lib/voice/intent";
import { buildWeeklyReview } from "@/lib/weekly-review/build-weekly-review";
import { loadWeeklyReviewRows } from "@/lib/weekly-review/load-weekly-review-data";
import { buildRecommendations } from "@/lib/weekly-review/recommendations";
import { resolveWeeklyReviewWindow } from "@/lib/weekly-review/week-window";
import type { WeeklyReviewData } from "@/lib/weekly-review/types";

/** The one entry point both the dashboard route and the voice tool use, so their numbers never diverge. */
export async function computeWeeklyReview(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<{ data: WeeklyReviewData; recommendations: string[] }> {
  const timezone = await loadUserTimezone(supabase, userId);
  const window = resolveWeeklyReviewWindow(now, timezone);
  const rows = await loadWeeklyReviewRows(supabase, userId, window);
  const data = buildWeeklyReview(rows, window, now);
  return { data, recommendations: buildRecommendations(data) };
}
