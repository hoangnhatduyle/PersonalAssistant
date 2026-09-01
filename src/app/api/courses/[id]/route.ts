import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { coursePatchSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { cascadeDeleteCourse } from "@/lib/api/cascade";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/courses/[id] (AC-4: another user's row is not-found, not leaked; NC-API-007: excludes soft-deleted unless asked). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  let query = supabase.from("courses").select("*").eq("id", id).eq("user_id", user.id);
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return serverErrorResponse("course get failed", error);
  if (!data) return notFoundResponse();

  return successResponse(data);
}

/**
 * PATCH /api/courses/[id]. When reminders_enabled/reminder_lead_minutes
 * changes, every live Deadline under this Course inherits the new setting,
 * so each of their Reminders is recomputed too (SPEC-API-004 AC-8). When
 * person_id changes (People feature), every live Deadline under this Course
 * inherits the Course's new owner too — a Deadline's person_id is never
 * client-set (see deadlinePayloadSchema), so it must be kept in sync here.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = coursePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  // An all-unrecognized-fields payload would otherwise reach PostgREST as an
  // empty UPDATE, which errors rather than no-opping — reject explicitly.
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
    .from("courses")
    .select("id, reminders_enabled, reminder_lead_minutes, person_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("course lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  const { data: updated, error: updateError } = await supabase
    .from("courses")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("course update failed", updateError);

  const remindersEnabled = parsed.data.reminders_enabled ?? existing.reminders_enabled;
  const reminderLeadMinutes = parsed.data.reminder_lead_minutes ?? existing.reminder_lead_minutes;
  const governanceChanged =
    parsed.data.reminders_enabled !== undefined || parsed.data.reminder_lead_minutes !== undefined;

  if (governanceChanged) {
    const { data: liveDeadlines, error: deadlinesError } = await supabase
      .from("deadlines")
      .select("id, due_at")
      .eq("course_id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (deadlinesError) return serverErrorResponse("course deadlines lookup failed", deadlinesError);

    // Each deadline's sync touches only its own reminder row, so they can run
    // concurrently instead of paying one sequential round-trip per deadline.
    await Promise.all(
      (liveDeadlines ?? []).map((deadline) =>
        syncReminderForTarget(supabase, {
          userId: user.id,
          targetType: "deadline",
          targetId: deadline.id,
          dueAt: deadline.due_at,
          remindersEnabled,
          reminderLeadMinutes,
        }),
      ),
    );
  }

  const personChanged = "person_id" in parsed.data && parsed.data.person_id !== existing.person_id;
  if (personChanged) {
    const { error: syncError } = await supabase
      .from("deadlines")
      .update({ person_id: parsed.data.person_id ?? null })
      .eq("course_id", id)
      .is("deleted_at", null);
    if (syncError) return serverErrorResponse("course deadlines person sync failed", syncError);
  }

  return successResponse(updated);
}

/**
 * DELETE /api/courses/[id] — soft-delete, cascading atomically to live
 * Deadlines/Reminders and clearing Note links (AC-7/AC-12/AC-13, NC-API-006/
 * 008). Discloses cascade scope in the response (Tracked debt).
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("courses")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("course lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  try {
    const cascade = await cascadeDeleteCourse(supabase, id);
    return successResponse({
      id,
      cascade: {
        deadlinesDeleted: cascade.deadlinesAffected,
        remindersDismissed: cascade.remindersDismissed,
        notesUnlinked: cascade.notesUnlinked,
        todoItemsDeleted: cascade.todoItemsAffected,
        suggestionsDismissed: cascade.suggestionsDismissed,
      },
    });
  } catch (error) {
    return serverErrorResponse("course delete failed", error);
  }
}
