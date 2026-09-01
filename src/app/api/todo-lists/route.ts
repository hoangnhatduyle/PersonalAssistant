import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { todoListPayloadSchema } from "@/lib/api/schemas";
import { successResponse, notFoundResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/** GET /api/todo-lists — list, scoped to the caller. `courseId` filters to one Course's list. */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("todo_lists")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const courseId = searchParams.get("courseId");
  if (courseId) query = query.eq("course_id", courseId);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("todo lists list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/**
 * POST /api/todo-lists — create. A non-null course_id must reference a
 * Course the caller owns (checked here; guard_todo_list_course_ownership
 * backstops it in the DB). course_id omitted/null makes a freestanding
 * custom list ("Misc", "Project: X").
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = todoListPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

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

  const { data: list, error: insertError } = await supabase
    .from("todo_lists")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (insertError) return serverErrorResponse("todo list create failed", insertError);

  return successResponse(list, { status: 201 });
}
