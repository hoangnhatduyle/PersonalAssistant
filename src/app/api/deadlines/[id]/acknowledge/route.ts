import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/deadlines/[id]/acknowledge — resets StaleItemsCard's staleness
 * clock by stamping acknowledged_at (see src/lib/dashboard/stale-items.ts).
 * No body. Kept out of the generic PATCH route rather than added to
 * deadlinePatchSchema, same as status (NC-API-002): a system-stamped
 * timestamp isn't a user-edited field, so the client shouldn't be able to
 * set it to an arbitrary value through PATCH.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("deadlines")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("deadline lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("deadlines")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("deadline acknowledge failed", updateError);

  return successResponse(updated);
}
