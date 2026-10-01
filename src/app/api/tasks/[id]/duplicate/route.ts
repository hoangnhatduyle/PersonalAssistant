import { requireAuthenticatedContext } from "@/lib/api/auth";
import { TASK_SELECT_WITH_LABELS } from "@/lib/api/labels";
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
 * POST /api/tasks/[id]/duplicate — "Duplicate as new" for a Done card. Done
 * is terminal (guard_task_status), so rather than reopening it the card is
 * copied into a fresh Open one with every completion detail dropped (see
 * supabase/migrations/0052_duplicate_task.sql for exactly what carries
 * over). No body. Restricted to Done cards: that's the only case the
 * feature exists for, and an Open card has no completion details to shed.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("task lookup failed", fetchError);
  if (!existing) return notFoundResponse();
  if (existing.status !== "Done") {
    return validationErrorResponse(`Only a Done card can be duplicated, got status "${existing.status}"`);
  }

  const { data: newId, error: duplicateError } = await supabase.rpc("duplicate_task", { p_task_id: id });
  if (duplicateError || !newId) return serverErrorResponse("task duplicate failed", duplicateError);

  const { data: task, error: refetchError } = await supabase
    .from("tasks")
    .select(TASK_SELECT_WITH_LABELS)
    .eq("id", newId)
    .single();
  if (refetchError) return serverErrorResponse("task refetch failed", refetchError);

  return successResponse(task, { status: 201 });
}
