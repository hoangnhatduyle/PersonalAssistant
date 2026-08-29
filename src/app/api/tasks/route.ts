import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { taskPayloadSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/** GET /api/tasks — list, scoped to the caller (NC-API-001/AC-4, NC-API-007). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("tasks")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("tasks list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/** POST /api/tasks — create (SPEC-API-004 AC-1/AC-6). A Task governs its own reminders. */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = taskPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (insertError) return serverErrorResponse("task create failed", insertError);

  await syncReminderForTarget(supabase, {
    userId: user.id,
    targetType: "task",
    targetId: task.id,
    dueAt: task.due_at,
    remindersEnabled: task.reminders_enabled,
    reminderLeadMinutes: task.reminder_lead_minutes,
  });

  return successResponse(task, { status: 201 });
}
