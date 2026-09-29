import { requireAuthenticatedContext } from "@/lib/api/auth";
import { knowledgeLinkCreateSchema } from "@/lib/api/schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { canonicalPair } from "@/lib/knowledge/graph";

const UNIQUE_VIOLATION = "23505";

/**
 * POST /api/knowledge/links — create a manual, undirected link. The pair is
 * normalized to canonical order before insert; re-linking an existing pair is
 * idempotent (returns the existing link). Both sources must belong to the
 * caller (404 otherwise) but may be in any status.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const body = await request.json().catch(() => null);
  const parsed = knowledgeLinkCreateSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const [sourceA, sourceB] = canonicalPair(parsed.data.source_id, parsed.data.target_id);

  const { data: owned, error: lookupError } = await supabase
    .from("knowledge_sources")
    .select("id")
    .eq("user_id", user.id)
    .in("id", [sourceA, sourceB]);
  if (lookupError) return serverErrorResponse("knowledge link source lookup failed", lookupError);
  if ((owned ?? []).length !== 2) return notFoundResponse();

  const { data: created, error: insertError } = await supabase
    .from("knowledge_links")
    .insert({ user_id: user.id, source_a: sourceA, source_b: sourceB })
    .select("id, source_a, source_b, created_at")
    .single();

  if (insertError) {
    if (insertError.code !== UNIQUE_VIOLATION) return serverErrorResponse("knowledge link create failed", insertError);
    const { data: existing, error: existingError } = await supabase
      .from("knowledge_links")
      .select("id, source_a, source_b, created_at")
      .eq("user_id", user.id)
      .eq("source_a", sourceA)
      .eq("source_b", sourceB)
      .maybeSingle();
    if (existingError || !existing) return serverErrorResponse("knowledge link lookup failed", existingError);
    return successResponse(existing);
  }

  return successResponse(created, { status: 201 });
}
