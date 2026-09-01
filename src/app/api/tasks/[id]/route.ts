import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { taskPatchSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { cascadeDeleteTask } from "@/lib/api/cascade";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/tasks/[id] (AC-4; NC-API-007: excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("tasks").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("task get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/**
 * PATCH /api/tasks/[id]. Never accepts `status` (NC-API-002 — use the
 * transition route). A Task governs its own reminders, so editing any of
 * due_at/reminders_enabled/reminder_lead_minutes recomputes its Reminder
 * (AC-8) — including the due_at branch that SPEC-API-004 AC-8's `given`
 * clause omits (Tracked debt): a Task's due_at can change independently of
 * its reminder settings and must still resync.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = taskPatchSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  // Every recognized field stripped (e.g. a payload that only tried to set
  // `status`) would otherwise reach PostgREST as an empty UPDATE, which
  // errors rather than no-opping — reject explicitly instead (NC-API-002/AC-2).
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

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

  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("task lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("tasks")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("task update failed", updateError);

  const governanceTouched =
    body &&
    typeof body === "object" &&
    ("due_at" in body || "reminders_enabled" in body || "reminder_lead_minutes" in body);

  if (governanceTouched) {
    await syncReminderForTarget(supabase, {
      userId: user.id,
      targetType: "task",
      targetId: id,
      dueAt: updated.due_at,
      remindersEnabled: updated.reminders_enabled,
      reminderLeadMinutes: updated.reminder_lead_minutes,
    });
  }

  return successResponse(updated);
}

/**
 * DELETE /api/tasks/[id] — soft-delete. The DB trigger atomically dismisses
 * its own Reminder; clearing linked_task_id on referencing Notes is a
 * separate statement, so it goes through the same-transaction cascade RPC
 * (AC-7/AC-13, NC-API-008).
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("task lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  try {
    const cascade = await cascadeDeleteTask(supabase, id);
    return successResponse({ id, cascade: { notesUnlinked: cascade.notesUnlinked } });
  } catch (error) {
    return serverErrorResponse("task delete failed", error);
  }
}
