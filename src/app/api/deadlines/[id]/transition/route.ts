import { requireAuthenticatedContext } from "@/lib/api/auth";
import { isDeadlineTransitionEvent, resolveDeadlineTransition } from "@/lib/api/transitions";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/deadlines/[id]/transition — the only way deadlines.status may
 * change (NC-API-002/AC-2). Body: { event: string }.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const event = body && typeof body === "object" && "event" in body ? String(body.event) : "";
  if (!isDeadlineTransitionEvent(event)) return validationErrorResponse(`Unknown transition event: ${event}`);

  const { data: existing, error: fetchError } = await supabase
    .from("deadlines")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("deadline lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const nextStatus = resolveDeadlineTransition(event, existing.status);
  if (!nextStatus) {
    return validationErrorResponse(`Cannot apply "${event}" from status "${existing.status}"`);
  }

  const { data: updated, error: updateError } = await supabase
    .from("deadlines")
    .update({ status: nextStatus })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("deadline transition failed", updateError);

  return successResponse(updated);
}
