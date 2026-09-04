import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { deadlinePatchSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { cascadeDeleteDeadline } from "@/lib/api/cascade";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/deadlines/[id] (AC-4; NC-API-007: excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("deadlines").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("deadline get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/**
 * PATCH /api/deadlines/[id]. Never accepts `status` (NC-API-002 — use the
 * transition route). When due_at is edited, the Reminder is recomputed
 * against the Deadline's current governing Course settings (AC-8).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = deadlinePatchSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  // An all-unrecognized-fields payload (e.g. `status` or `course_id`) would
  // otherwise reach PostgREST as an empty UPDATE, which errors rather than
  // no-opping — reject explicitly.
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  const { data: existing, error: fetchError } = await supabase
    .from("deadlines")
    .select("id, course_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("deadline lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("deadlines")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("deadline update failed", updateError);

  if (body && typeof body === "object" && "due_at" in body) {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("reminders_enabled, reminder_lead_minutes")
      .eq("id", existing.course_id)
      .single();
    if (courseError) return serverErrorResponse("course lookup failed", courseError);

    await syncReminderForTarget(supabase, {
      userId: user.id,
      targetType: "deadline",
      targetId: id,
      dueAt: updated.due_at,
      remindersEnabled: course.reminders_enabled,
      reminderLeadMinutes: course.reminder_lead_minutes,
    });
  }

  return successResponse(updated);
}

/**
 * DELETE /api/deadlines/[id] — soft-delete, cascading atomically to the
 * deadline's live Sessions (AC-7/AC-9, NC-API-006; deleting a deadline
 * cascade-soft-deletes its linked sessions, not unlink-and-keep). The DB
 * trigger dismisses the deadline's own Reminder as part of the same UPDATE.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("deadlines")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("deadline lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  try {
    const cascade = await cascadeDeleteDeadline(supabase, id);
    return successResponse({
      id,
      cascade: { sessionsAffected: cascade.sessionsAffected, remindersDismissed: cascade.remindersDismissed },
    });
  } catch (error) {
    return serverErrorResponse("deadline delete failed", error);
  }
}
