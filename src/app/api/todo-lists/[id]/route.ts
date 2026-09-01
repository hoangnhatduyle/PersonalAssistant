import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { todoListPatchSchema } from "@/lib/api/schemas";
import { cascadeDeleteTodoList } from "@/lib/api/cascade";
import { successResponse, notFoundResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/todo-lists/[id] (excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("todo_lists").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("todo list get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/** PATCH /api/todo-lists/[id] — rename a list or relink/unlink its course. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = todoListPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  const { data: existing, error: fetchError } = await supabase
    .from("todo_lists")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("todo list lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  if (parsed.data.course_id) {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", parsed.data.course_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (courseError) return serverErrorResponse("course lookup failed", courseError);
    if (!course) return notFoundResponse();
  }

  const { data: updated, error: updateError } = await supabase
    .from("todo_lists")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("todo list update failed", updateError);

  return successResponse(updated);
}

/** DELETE /api/todo-lists/[id] — soft-delete; cascades to the list's live items atomically. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("todo_lists")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("todo list lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  try {
    const cascade = await cascadeDeleteTodoList(supabase, id);
    return successResponse({ id, cascade: { itemsDeleted: cascade.itemsAffected } });
  } catch (error) {
    return serverErrorResponse("todo list delete failed", error);
  }
}
