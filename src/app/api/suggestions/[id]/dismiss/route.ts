import { requireAuthenticatedContext } from "@/lib/api/auth";
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
 * POST /api/suggestions/[id]/dismiss — pending -> dismissed, no body. A
 * pure status flip (unlike Apply, which mutates a Course/Task), so this
 * gets its own dedicated route rather than sharing an event-discriminated
 * one with apply/route.ts.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("personalization_suggestions")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("suggestion lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  // Re-assert status at the point of mutation: an optimistic-concurrency
  // guard against a losing race with a concurrent Apply on the same row
  // (mirrors src/app/api/reminders/[id]/ack/route.ts).
  const { data: updated, error: updateError } = await supabase
    .from("personalization_suggestions")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) return serverErrorResponse("suggestion dismiss failed", updateError);
  if (!updated) return validationErrorResponse(`Cannot dismiss a suggestion in status "${existing.status}"`);

  return successResponse(updated);
}
