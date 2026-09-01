import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { taskPayloadSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { successResponse, validationErrorResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * GET /api/tasks — list, scoped to the caller (NC-API-001/AC-4, NC-API-007).
 * `personId` filters to one tracked Person's tasks ("me" for the account
 * owner's own, unfiltered when omitted — People feature).
 */
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

  const personId = searchParams.get("personId");
  if (personId === "me") query = query.is("person_id", null);
  else if (personId) query = query.eq("person_id", personId);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("tasks list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/**
 * POST /api/tasks — create (SPEC-API-004 AC-1/AC-6). A Task governs its own
 * reminders. A non-null person_id must reference a Person the caller owns
 * (People feature) — the guard_task_person_ownership DB trigger backstops this.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = taskPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  if (parsed.data.person_id) {
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id")
      .eq("id", parsed.data.person_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (personError) return serverErrorResponse("person lookup failed", personError);
    if (!person) return notFoundResponse();
  }

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
