import { requireAuthenticatedContext } from "@/lib/api/auth";
import { notFoundResponse, serverErrorResponse, successResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** DELETE /api/knowledge/links/[id] — remove a manual link. Existence is checked first so a missing/foreign id is a 404, not a silent no-op. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("knowledge_links")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("knowledge link lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { error: deleteError } = await supabase.from("knowledge_links").delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) return serverErrorResponse("knowledge link delete failed", deleteError);

  return successResponse({ id });
}
