import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { checklistItemPayloadSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * GET /api/checklist-items?taskId=... — list one card's checklist, scoped to
 * the caller (NC-API-001/AC-4, NC-API-007). taskId is required: unlike
 * Notes, checklist items are never browsed unfiltered.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return validationErrorResponse("taskId is required");

  let query = supabase
    .from("checklist_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .order("position", { ascending: true });
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);

  const { data, error } = await query;
  if (error) return serverErrorResponse("checklist items list failed", error);

  return successResponse(data);
}

/**
 * POST /api/checklist-items — create. task_id must reference a Task the
 * caller owns (checked here; guard_checklist_item_task_ownership backstops
 * it — supabase/migrations/0030_checklist_items.sql).
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = checklistItemPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", parsed.data.task_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (taskError) return serverErrorResponse("task lookup failed", taskError);
  if (!task) return notFoundResponse();

  const { data, error } = await supabase
    .from("checklist_items")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (error) return serverErrorResponse("checklist item create failed", error);

  return successResponse(data, { status: 201 });
}
