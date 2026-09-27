import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EventStatus } from "@/lib/api/entity-types";
import { resolveEventTransition, type EventTransitionEvent } from "@/lib/api/transitions";

export type RecurringEventTransitionOutcome =
  | { applied: true; status: EventStatus }
  | { applied: false; currentStatus: EventStatus };

/**
 * The write-path counterpart to resolveDisplayedEventStatus's read path
 * (src/lib/appointments/occurrence-status.ts): applies an event transition
 * to one occurrence of a recurring appointment by upserting
 * appointment_occurrence_status, never touching the appointments row's own
 * event_status column (frozen at 'planned' for a recurring row, per
 * supabase/migrations/0049_appointment_occurrence_status.sql's design).
 * Shared by POST /api/appointments/[id]/transition and the voice assistant's
 * event-transition mutation (src/lib/voice/mutations.ts) so this upsert
 * logic lives in exactly one place.
 *
 * Absent row for this occurrence means "planned" by convention (same default
 * the read path uses) — fetched fresh here rather than trusted from the
 * caller, so a concurrent transition on the same occurrence can't race past
 * a stale assumption about the current status.
 */
export async function applyRecurringEventTransition(
  supabase: SupabaseClient<Database>,
  appointmentId: string,
  occurrenceDate: string,
  event: EventTransitionEvent,
): Promise<RecurringEventTransitionOutcome> {
  const { data: existing, error: fetchError } = await supabase
    .from("appointment_occurrence_status")
    .select("status")
    .eq("appointment_id", appointmentId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const currentStatus: EventStatus = existing?.status ?? "planned";
  const nextStatus = resolveEventTransition(event, currentStatus);
  if (!nextStatus) return { applied: false, currentStatus };

  const { error: upsertError } = await supabase
    .from("appointment_occurrence_status")
    .upsert(
      { appointment_id: appointmentId, occurrence_date: occurrenceDate, status: nextStatus },
      { onConflict: "appointment_id,occurrence_date" },
    );
  if (upsertError) throw upsertError;

  return { applied: true, status: nextStatus };
}
