import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { notePatchSchema } from "@/lib/api/schemas";
import { ownsNoteLinkTargets } from "@/lib/api/notes";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/notes/[id] (AC-4; NC-API-007: excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("notes").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("note get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/** PATCH /api/notes/[id]. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = notePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  // An all-unrecognized-fields payload would otherwise reach PostgREST as an
  // empty UPDATE, which errors rather than no-opping — reject explicitly.
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  const owns = await ownsNoteLinkTargets(supabase, user.id, parsed.data.linked_course_id, parsed.data.linked_task_id);
  if (!owns) return validationErrorResponse("linked_course_id/linked_task_id must reference a resource you own");

  const { data: existing, error: fetchError } = await supabase
    .from("notes")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("note lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("notes")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("note update failed", updateError);

  return successResponse(updated);
}

/** DELETE /api/notes/[id] — soft-delete (AC-7, NC-API-006). A Note has no cascades of its own. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("notes")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("note lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { error: deleteError } = await supabase
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (deleteError) return serverErrorResponse("note delete failed", deleteError);

  return successResponse({ id });
}
