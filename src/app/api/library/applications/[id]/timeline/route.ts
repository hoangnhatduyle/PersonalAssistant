import { requireAuthenticatedContext } from "@/lib/api/auth";
import { notFoundResponse, serverErrorResponse, successResponse } from "@/lib/api/response";
import { getApplicationTimeline } from "@/lib/library/server/interviews";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/library/applications/[id]/timeline — status history and interviews merged chronologically. */
export async function GET(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    const timeline = await getApplicationTimeline(supabase, user.id, id);
    return timeline ? successResponse(timeline) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library application timeline failed", error);
  }
}
