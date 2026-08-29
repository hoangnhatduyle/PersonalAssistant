import { requireAuthenticatedContext } from "@/lib/api/auth";
import { resolveReminderTransition } from "@/lib/api/transitions";
import { reminderAckSchema } from "@/lib/api/schemas";
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
 * POST /api/reminders/[id]/ack — the only way reminders.acknowledgment_state
 * may change by user action (NC-API-002, SPEC-API-004 AC-5). Body:
 * { event: "user_acknowledges" | "user_dismisses" | "user_snoozes",
 *   snooze_until?: string }.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = reminderAckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  const { event, snooze_until: snoozeUntil } = parsed.data;
  if (event === "user_snoozes" && !snoozeUntil) {
    return validationErrorResponse("snooze_until is required for user_snoozes");
  }

  const { data: existing, error: fetchError } = await supabase
    .from("reminders")
    .select("id, acknowledgment_state")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("reminder lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  // SPEC-API-004 AC-5: only a Delivered reminder accepts any of these events.
  const nextState = resolveReminderTransition(event, existing.acknowledgment_state);
  if (!nextState) {
    return validationErrorResponse(`Cannot apply "${event}" from state "${existing.acknowledgment_state}"`);
  }

  const update =
    event === "user_snoozes" ? { acknowledgment_state: nextState, snooze_until: snoozeUntil } : { acknowledgment_state: nextState };

  // Re-assert ownership and the state read above at the point of mutation:
  // the dispatch sweep (supabase/migrations/0001_init.sql's
  // dispatch_due_reminders(), run every minute per SPEC-INFRA-004) can flip
  // this same reminder Delivered -> Expired between the SELECT above and
  // this UPDATE. Without acknowledgment_state in the WHERE clause, that race
  // would hit the DB's guard_reminder_status trigger and surface as a 500
  // instead of AC-5's "rejected as an invalid transition" — matching zero
  // rows here reports the same validation error a losing race should.
  const { data: updated, error: updateError } = await supabase
    .from("reminders")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("acknowledgment_state", existing.acknowledgment_state)
    .select("*")
    .maybeSingle();
  if (updateError) return serverErrorResponse("reminder transition failed", updateError);
  if (!updated) {
    return validationErrorResponse(`Cannot apply "${event}" from state "${existing.acknowledgment_state}"`);
  }

  return successResponse(updated);
}
