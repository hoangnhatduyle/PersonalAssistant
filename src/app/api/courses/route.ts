import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { coursePayloadSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/** GET /api/courses — list, scoped to the caller (NC-API-001/AC-4, NC-API-007). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("courses")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("courses list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/** POST /api/courses — create (SPEC-API-004 shared_schemas CoursePayload). */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = coursePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data, error } = await supabase
    .from("courses")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (error) return serverErrorResponse("course create failed", error);

  return successResponse(data, { status: 201 });
}
