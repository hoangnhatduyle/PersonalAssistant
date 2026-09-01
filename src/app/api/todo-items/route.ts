import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { todoItemPayloadSchema } from "@/lib/api/schemas";
import { successResponse, notFoundResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * GET /api/todo-items — every live item the caller owns, optionally filtered
 * to one list. Fetched unscoped and grouped client-side by the To-Do board
 * (same "fetch everything, compose client-side" convention as
 * DashboardContainer) rather than nesting items under each list response.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("todo_items")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const listId = searchParams.get("listId");
  if (listId) query = query.eq("list_id", listId);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("todo items list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/** POST /api/todo-items — create an item under a list the caller owns. */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = todoItemPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: list, error: listError } = await supabase
    .from("todo_lists")
    .select("id")
    .eq("id", parsed.data.list_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (listError) return serverErrorResponse("todo list lookup failed", listError);
  if (!list) return notFoundResponse();

  const { data: item, error: insertError } = await supabase
    .from("todo_items")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (insertError) return serverErrorResponse("todo item create failed", insertError);

  return successResponse(item, { status: 201 });
}
