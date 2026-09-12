import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { labelPatchSchema } from "@/lib/api/schemas";
import { cascadeDeleteLabel } from "@/lib/api/cascade";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/labels/[id] (AC-4; NC-API-007: excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("labels").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("label get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/** PATCH /api/labels/[id] — edit name/color (LabelEditor.tsx's Save). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = labelPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  // An all-unrecognized-fields payload would otherwise reach PostgREST as an
  // empty UPDATE, which errors rather than no-opping — reject explicitly.
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  const { data: existing, error: fetchError } = await supabase
    .from("labels")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("label lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("labels")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("label update failed", updateError);

  return successResponse(updated);
}

/**
 * DELETE /api/labels/[id] — soft-delete, cascading atomically to unlink
 * (hard-delete, task_labels has no soft-delete of its own) every Task
 * referencing it (LabelEditor.tsx's Delete).
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("labels")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("label lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  try {
    const cascade = await cascadeDeleteLabel(supabase, id);
    return successResponse({ id, cascade: { tasksUnlinked: cascade.tasksUnlinked } });
  } catch (error) {
    return serverErrorResponse("label delete failed", error);
  }
}
