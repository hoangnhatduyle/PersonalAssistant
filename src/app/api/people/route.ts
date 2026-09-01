import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { personPayloadSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/** GET /api/people — list, scoped to the caller (NC-API-001/AC-4, NC-API-007). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("people")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("people list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/** POST /api/people — create (SPEC-API-004 shared_schemas PersonPayload). */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = personPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data, error } = await supabase
    .from("people")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (error) return serverErrorResponse("person create failed", error);

  return successResponse(data, { status: 201 });
}
