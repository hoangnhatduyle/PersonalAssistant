import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { appointmentPatchSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("appointments").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("appointment get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = appointmentPatchSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  const { data: existing, error: fetchError } = await supabase
    .from("appointments")
    .select("id, deadline_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("appointment lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  // A session's category must stay 'Session' regardless of client input —
  // keeps the Calendar tag from drifting on an otherwise-normal edit.
  const updatePayload = existing.deadline_id ? { ...parsed.data, category: "Session" } : parsed.data;

  const { data: updated, error: updateError } = await supabase
    .from("appointments")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("appointment update failed", updateError);

  const dueAt = `${updated.date}T00:00:00.000Z`;
  await syncReminderForTarget(supabase, {
    userId: user.id,
    targetType: "appointment",
    targetId: id,
    dueAt,
    remindersEnabled: updated.reminders_enabled,
    reminderLeadMinutes: updated.reminder_lead_minutes,
  });

  return successResponse(updated);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("appointments")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("appointment lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { error: deleteError } = await supabase
    .from("appointments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (deleteError) return serverErrorResponse("appointment delete failed", deleteError);

  return successResponse({ id });
}
