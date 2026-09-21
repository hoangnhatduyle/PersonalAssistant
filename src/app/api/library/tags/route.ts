import { requireAuthenticatedContext } from "@/lib/api/auth";
import { serverErrorResponse, successResponse } from "@/lib/api/response";
import { listTagCounts } from "@/lib/library/server/posts";

/** GET /api/library/tags — `{tag, n}` for the caller's live posts, most used first. */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase } = ctx;

  try {
    return successResponse(await listTagCounts(supabase));
  } catch (error) {
    return serverErrorResponse("library tags list failed", error);
  }
}
