import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { notePayloadSchema } from "@/lib/api/schemas";
import { ownsNoteLinkTargets } from "@/lib/api/notes";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/** GET /api/notes — list, scoped to the caller (NC-API-001/AC-4, NC-API-007). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("notes")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("notes list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/** POST /api/notes — create (SPEC-API-004 shared_schemas NotePayload). */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = notePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const owns = await ownsNoteLinkTargets(supabase, user.id, parsed.data.linked_course_id, parsed.data.linked_task_id);
  if (!owns) return validationErrorResponse("linked_course_id/linked_task_id must reference a resource you own");

  const { data, error } = await supabase
    .from("notes")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (error) return serverErrorResponse("note create failed", error);

  return successResponse(data, { status: 201 });
}
