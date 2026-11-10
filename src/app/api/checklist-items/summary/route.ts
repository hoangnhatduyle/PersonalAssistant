import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import { summarizeChecklistRows } from "@/lib/progress/checklist-summary";

/**
 * GET /api/checklist-items/summary — done/total checklist counts per card, for every
 * card the caller owns. The Up Next Gantt needs these to derive a card's progress, and
 * GET /api/checklist-items requires a taskId, so it would otherwise cost one request per
 * card. Scoped to the caller like every other route (NC-API-001, NC-API-007).
 */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from("checklist_items")
    .select("task_id, is_done")
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return serverErrorResponse("checklist summary failed", error);

  return successResponse(summarizeChecklistRows(data ?? []));
}
