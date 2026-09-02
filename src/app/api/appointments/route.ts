import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { appointmentPayloadSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import {
  successResponse,
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

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("appointments list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = appointmentPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: appointment, error: insertError } = await supabase
    .from("appointments")
    .insert({ user_id: user.id, ...parsed.data })
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
