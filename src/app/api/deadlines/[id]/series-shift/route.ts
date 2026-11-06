import { requireAuthenticatedContext } from "@/lib/api/auth";
import { deadlineSeriesShiftSchema } from "@/lib/api/schemas";
import { shiftDeadlineSeries } from "@/lib/api/deadline-recurrence";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { successResponse, notFoundResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/deadlines/[id]/series-shift — "All occurrences" for a recurring
 * deadline dragged on the calendar: it lands at `due_at` and the whole series'
 * time of day and weekday follow (shift_deadline_series, 0062). Moving just
 * this occurrence is the ordinary PATCH of due_at, which leaves the schedule
 * alone. Reminders of every changed occurrence are recomputed.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = deadlineSeriesShiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: existing, error: fetchError } = await supabase
    .from("deadlines")
    .select("id, recurrence_series_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("deadline lookup failed", fetchError);
  if (!existing) return notFoundResponse();
  if (!existing.recurrence_series_id) return validationErrorResponse("Deadline is not recurring");

  try {
    const shifted = await shiftDeadlineSeries(supabase, id, parsed.data.due_at);
    // Nothing open to move: the deadline is already Completed/Cancelled/Submitted.
    if (shifted.length === 0) return validationErrorResponse("Only an open deadline can change its schedule");
    for (const row of shifted) {
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select("reminders_enabled, reminder_lead_minutes")
        .eq("id", row.course_id)
        .single();
      if (courseError) throw courseError;
      await syncReminderForTarget(supabase, {
        userId: user.id,
        targetType: "deadline",
        targetId: row.id,
        dueAt: row.due_at,
        remindersEnabled: course.reminders_enabled,
        reminderLeadMinutes: course.reminder_lead_minutes,
      });
    }
    return successResponse({ shifted });
  } catch (error) {
    // check_violation: the new weekday is already one of the series' days.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23514") {
      return validationErrorResponse("This series already repeats on that weekday");
    }
    return serverErrorResponse("deadline series shift failed", error);
  }
}
