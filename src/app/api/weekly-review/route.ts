import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import { computeWeeklyReview } from "@/lib/weekly-review/compute-weekly-review";
import { generateNarrative } from "@/lib/weekly-review/generate-narrative";
import type { WeeklyReviewResponse } from "@/lib/weekly-review/types";

export async function POST() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const now = new Date();
    const { data, recommendations } = await computeWeeklyReview(supabase, user.id, now);
    const narrative = await generateNarrative(data);

    return successResponse<WeeklyReviewResponse>({
      generatedAt: now.toISOString(),
      weekKey: data.weekKey,
      data,
      narrative,
      recommendations,
    });
  } catch (error) {
    return serverErrorResponse("weekly review generation failed", error);
  }
}
