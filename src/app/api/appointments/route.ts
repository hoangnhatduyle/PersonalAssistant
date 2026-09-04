import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { appointmentPayloadSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("appointments")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("date", { ascending: true })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const deadlineId = searchParams.get("deadlineId");
  if (deadlineId) query = query.eq("deadline_id", deadlineId);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("appointments list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/**
 * POST /api/appointments. When deadline_id is set (Deadline Sessions), the
 * deadline must be owned by the caller (mirrors the course-ownership check
 * in POST /api/deadlines) and category/session_status are server-forced
 * regardless of client input — session_status must start 'planned'
 * (NC-API-002-adjacent state-machine invariant, guard_session_status backs
 * this up at the DB level too) and category tags the row 'Session' so it's
 * visually distinct in the Calendar tab.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = appointmentPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const insertPayload: typeof parsed.data & { category?: string; session_status?: "planned" } = { ...parsed.data };

  if (parsed.data.deadline_id) {
    const { data: deadline, error: deadlineError } = await supabase
      .from("deadlines")
      .select("id")
      .eq("id", parsed.data.deadline_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (deadlineError) return serverErrorResponse("deadline lookup failed", deadlineError);
    if (!deadline) return notFoundResponse();

    insertPayload.category = "Session";
    insertPayload.session_status = "planned";
  }

  const { data: appointment, error: insertError } = await supabase
    .from("appointments")
    .insert({ user_id: user.id, ...insertPayload })
    .select("*")
    .single();
  if (insertError) return serverErrorResponse("appointment create failed", insertError);

  const remindersEnabled = appointment.reminders_enabled ?? false;
  if (remindersEnabled) {
    const dueAt = `${appointment.date}T00:00:00.000Z`;
    await syncReminderForTarget(supabase, {
      userId: user.id,
      targetType: "appointment",
      targetId: appointment.id,
      dueAt,
      remindersEnabled: true,
      reminderLeadMinutes: appointment.reminder_lead_minutes ?? 60,
    });
  }

  return successResponse(appointment, { status: 201 });
}
