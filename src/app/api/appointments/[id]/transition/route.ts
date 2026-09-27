import { requireAuthenticatedContext } from "@/lib/api/auth";
import {
  isSessionTransitionEvent,
  resolveSessionTransition,
  isEventTransitionEvent,
  resolveEventTransition,
} from "@/lib/api/transitions";
import { applyRecurringEventTransition } from "@/lib/api/appointment-occurrence-transition";
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
 * POST /api/appointments/[id]/transition — the only way an appointment's
 * session_status (Deadline Sessions, deadline_id set) or event_status
 * (general Events, deadline_id null) may change (NC-API-002, structural
 * mirror of POST /api/deadlines/[id]/transition). Body: { event: string,
 * occurrenceDate?: string }. Which field moves is determined by which of the
 * two disjoint event-name sets `event` belongs to — a Session's events never
 * touch event_status and vice versa, mirroring how the two status columns
 * are themselves mutually exclusive (guard_session_status / guard_event_status).
 *
 * `occurrenceDate` is required when the target is a RECURRING event
 * (meeting_blocks non-empty) — the client has already resolved it (see
 * src/lib/appointments/occurrence-status.ts's getRelevantOccurrenceDateKey
 * batching in AppointmentsTimeline/UpNextPanel). A recurring row's own
 * event_status column is never touched by this branch — it stays frozen at
 * 'planned' from creation, and appointment_occurrence_status is the
 * authoritative store instead (0049_appointment_occurrence_status.sql). A
 * non-recurring event's path below is byte-for-byte unchanged from before
 * this table existed.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const event = body && typeof body === "object" && "event" in body ? String(body.event) : "";
  const occurrenceDate =
    body && typeof body === "object" && "occurrenceDate" in body && typeof body.occurrenceDate === "string"
      ? body.occurrenceDate
      : null;
  if (!isSessionTransitionEvent(event) && !isEventTransitionEvent(event)) {
    return validationErrorResponse(`Unknown transition event: ${event}`);
  }

  const { data: existing, error: fetchError } = await supabase
    .from("appointments")
    .select("id, session_status, event_status, meeting_blocks")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return serverErrorResponse("appointment lookup failed", fetchError);
  if (!existing) return notFoundResponse();

  if (isSessionTransitionEvent(event)) {
    if (existing.session_status === null) return validationErrorResponse("This appointment is not a session");

    const nextStatus = resolveSessionTransition(event, existing.session_status);
    if (!nextStatus) {
      return validationErrorResponse(`Cannot apply "${event}" from status "${existing.session_status}"`);
    }

    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({ session_status: nextStatus })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) return serverErrorResponse("session transition failed", updateError);

    return successResponse(updated);
  }

  if (existing.event_status === null) return validationErrorResponse("This appointment is not an event");

  const isRecurring = Array.isArray(existing.meeting_blocks) && existing.meeting_blocks.length > 0;

  if (isRecurring) {
    if (!occurrenceDate) return validationErrorResponse("occurrenceDate is required for a recurring appointment");

    const outcome = await applyRecurringEventTransition(supabase, id, occurrenceDate, event);
    if (!outcome.applied) {
      return validationErrorResponse(`Cannot apply "${event}" from status "${outcome.currentStatus}"`);
    }

    const { data: appointment, error: reselectError } = await supabase.from("appointments").select("*").eq("id", id).single();
    if (reselectError) return serverErrorResponse("appointment lookup failed", reselectError);

    return successResponse(appointment);
  }

  const nextStatus = resolveEventTransition(event, existing.event_status);
  if (!nextStatus) {
    return validationErrorResponse(`Cannot apply "${event}" from status "${existing.event_status}"`);
  }

  const { data: updated, error: updateError } = await supabase
    .from("appointments")
    .update({ event_status: nextStatus })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return serverErrorResponse("event transition failed", updateError);

  return successResponse(updated);
}
