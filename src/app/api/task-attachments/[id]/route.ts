import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { attachmentPatchSchema } from "@/lib/api/schemas";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/task-attachments/[id] (AC-4; NC-API-007: excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("task_attachments").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("attachment get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/** PATCH /api/task-attachments/[id] — edits `title` only; kind/url/storage fields are immutable after create. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = attachmentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: existing, error: fetchError } = await supabase
    .from("task_attachments")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("attachment lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("task_attachments")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("attachment update failed", updateError);

  return successResponse(updated);
}

/**
 * DELETE /api/task-attachments/[id] — soft-delete. A kind='file' row's
 * Storage bytes are deliberately never removed here (see
 * 0032_task_attachments.sql) — consistent with this app never hard-purging
 * soft-deleted data anywhere today.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("task_attachments")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("attachment lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { error: deleteError } = await supabase
    .from("task_attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (deleteError) return serverErrorResponse("attachment delete failed", deleteError);

  return successResponse({ id });
}
