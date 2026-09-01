import { requireAuthenticatedContext } from "@/lib/api/auth";
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

/**
 * POST /api/suggestions/[id]/apply — writes the suggestion's server-trusted
 * to_value onto the target Course's/Task's reminder_lead_minutes (the only
 * field this feature ever proposes changing), recomputes every affected
 * Reminder via the existing syncReminderForTarget() (src/lib/api/
 * reminders.ts, unchanged), then transitions the suggestion to applied. No
 * body — the client only ever applies exactly what was proposed, never an
 * edited value.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: suggestion, error: fetchError } = await supabase
    .from("personalization_suggestions")
    .select("id, status, scope, target_id, to_value")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("suggestion lookup failed", fetchError);
  if (!suggestion) return notFoundResponse();
  if (suggestion.status !== "pending") {
    return validationErrorResponse(`Cannot apply a suggestion in status "${suggestion.status}"`);
  }

  if (suggestion.scope === "course") {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, reminders_enabled")
      .eq("id", suggestion.target_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (courseError) return serverErrorResponse("course lookup failed", courseError);
    // The soft-delete cascade auto-dismisses a pending suggestion targeting
    // a deleted Course, so this should be rare — still guarded here rather
    // than trusting that cascade as the only gate.
    if (!course) return validationErrorResponse("This suggestion's Course no longer exists");

    const { error: updateError } = await supabase
      .from("courses")
      .update({ reminder_lead_minutes: suggestion.to_value })
      .eq("id", course.id);
    if (updateError) return serverErrorResponse("course update failed", updateError);

    const { data: liveDeadlines, error: deadlinesError } = await supabase
      .from("deadlines")
      .select("id, due_at")
      .eq("course_id", course.id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (deadlinesError) return serverErrorResponse("course deadlines lookup failed", deadlinesError);

    await Promise.all(
      (liveDeadlines ?? []).map((deadline) =>
        syncReminderForTarget(supabase, {
          userId: user.id,
          targetType: "deadline",
          targetId: deadline.id,
          dueAt: deadline.due_at,
          remindersEnabled: course.reminders_enabled,
          reminderLeadMinutes: suggestion.to_value,
        }),
      ),
    );
  } else {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, due_at, reminders_enabled")
      .eq("id", suggestion.target_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (taskError) return serverErrorResponse("task lookup failed", taskError);
    if (!task) return validationErrorResponse("This suggestion's Task no longer exists");

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ reminder_lead_minutes: suggestion.to_value })
      .eq("id", task.id);
    if (updateError) return serverErrorResponse("task update failed", updateError);

    await syncReminderForTarget(supabase, {
      userId: user.id,
      targetType: "task",
      targetId: task.id,
      dueAt: task.due_at,
      remindersEnabled: task.reminders_enabled,
      reminderLeadMinutes: suggestion.to_value,
    });
  }

  // Re-assert status at the point of mutation: an optimistic-concurrency
  // guard against a losing race with a concurrent Dismiss on the same row
  // (mirrors src/app/api/reminders/[id]/ack/route.ts).
  const { data: updated, error: transitionError } = await supabase
    .from("personalization_suggestions")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (transitionError) return serverErrorResponse("suggestion apply failed", transitionError);
  if (!updated) return validationErrorResponse(`Cannot apply a suggestion in status "${suggestion.status}"`);

  return successResponse(updated);
}
