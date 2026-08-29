import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/feedback/[id] — hard-deletes one feedback row the caller owns
 * (AC-13; operationalizes SPEC-DATA-010 AC-12/NC-DATA-011). Unlike the
 * Course/Deadline/Task/Note delete routes (NC-API-006, soft-delete only),
 * this is a real DELETE: feedback has no undelete story (NC-API-009).
 * Existence is checked first (same SELECT-then-mutate shape as
 * notes/[id]/route.ts) so a missing/foreign/already-deleted id surfaces as
 * not-found/forbidden rather than a silent no-op success.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("feedback")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("feedback lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { error: deleteError } = await supabase.from("feedback").delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) return serverErrorResponse("feedback delete failed", deleteError);

  return successResponse({ id });
}
