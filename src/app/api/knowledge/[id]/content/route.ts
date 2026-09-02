import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/knowledge/[id]/content — the one surface that deliberately
 * exposes raw_content (KNOWLEDGE_SOURCE_PUBLIC_COLUMNS excludes it
 * everywhere else, per src/lib/knowledge/constants.ts's comment, to keep
 * the list/detail payload bounded). Kept as its own route rather than
 * widening GET /api/knowledge/[id] so that response shape stays untouched
 * for every other caller. Still scoped to the owning user via the same
 * `eq("user_id", user.id)` + RLS pattern as every other knowledge route.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("id, raw_content")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return serverErrorResponse("knowledge source content lookup failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}
