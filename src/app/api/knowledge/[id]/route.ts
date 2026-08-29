import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";
import { KNOWLEDGE_SOURCE_PUBLIC_COLUMNS, KNOWLEDGE_STORAGE_BUCKET } from "@/lib/knowledge/constants";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/knowledge/[id] — single source with status/error_message (NC-API-013, AC-001). */
export async function GET(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data, error } = await supabase
    .from("knowledge_sources")
    .select(KNOWLEDGE_SOURCE_PUBLIC_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return serverErrorResponse("knowledge source lookup failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/**
 * DELETE /api/knowledge/[id] — hard delete (NC-API-017): chunk removal is
 * automatic via SPEC-DATA-011's FK cascade in this same statement, never a
 * separate step this layer orchestrates. Existence is checked first (same
 * SELECT-then-mutate shape as feedback/[id]/route.ts) so a missing/foreign
 * id surfaces as not-found rather than a silent no-op success.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("knowledge_sources")
    .select("id, storage_object_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("knowledge source lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { error: deleteError } = await supabase.from("knowledge_sources").delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) return serverErrorResponse("knowledge source delete failed", deleteError);

  if (existing.storage_object_path) {
    // Best-effort: the row and its chunks (FK cascade) are already gone —
    // an orphaned Storage object is a cleanup nicety, not a correctness gap.
    await supabase.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove([existing.storage_object_path]).catch(() => {});
  }

  return successResponse({ id });
}
