import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import { generateSuggestionsForUser } from "@/lib/personalization/generate-for-user";

/**
 * POST /api/suggestions/generate — on-demand only, never a scheduled job
 * (each call costs an LLM request, so the user explicitly triggers it via
 * the "Check for suggestions" button, src/components/dashboard/
 * PersonalizationSuggestionsPanel.tsx). Scoped entirely to the caller's own
 * feedback/courses/tasks via requireAuthenticatedContext() + explicit
 * user_id filters inside generateSuggestionsForUser — no service-role
 * client needed.
 */
export async function POST() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const result = await generateSuggestionsForUser(supabase, user.id);
    return successResponse(result);
  } catch (error) {
    return serverErrorResponse("suggestion generation failed", error);
  }
}
