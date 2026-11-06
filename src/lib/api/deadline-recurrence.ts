import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DeadlineRow } from "@/lib/api/entity-types";

/**
 * "Cancel the whole series" for a recurring Deadline
 * (supabase/migrations/0042_deadline_series.sql): cancels every still-open
 * occurrence, spares Completed/Submitted ones, and stops any further
 * occurrences from appearing, all in one transaction. Cancelling just one
 * occurrence needs no helper -- it's the ordinary user_cancels transition,
 * and the database creates that occurrence's successor itself.
 *
 * Shared by POST /api/deadlines/[id]/transition and the voice executor
 * (src/lib/voice/mutations.ts). The caller has already checked that
 * user_cancels is legal from the deadline's current status. Returns the
 * refreshed row for the deadline the user acted on.
 */
export async function cancelDeadlineSeries(supabase: SupabaseClient<Database>, deadlineId: string): Promise<DeadlineRow> {
  const { error } = await supabase.rpc("cancel_deadline_series", { p_deadline_id: deadlineId });
  if (error) throw error;

  const { data, error: fetchError } = await supabase.from("deadlines").select("*").eq("id", deadlineId).single();
  if (fetchError) throw fetchError;
  return data;
}

export interface ShiftedDeadline {
  id: string;
  due_at: string;
  course_id: string;
}

/**
 * "All occurrences" for a recurring Deadline moved on the calendar
 * (shift_deadline_series, supabase/migrations/0062_deadline_recurrence_anchor.sql):
 * the occurrence lands at `dueAt` and the series' time of day and weekday
 * follow, for every open upcoming occurrence. Returns the rows it changed (the
 * caller resyncs their reminders); empty when the deadline is not recurring or
 * not the caller's.
 */
export async function shiftDeadlineSeries(supabase: SupabaseClient<Database>, deadlineId: string, dueAt: string): Promise<ShiftedDeadline[]> {
  const { data, error } = await supabase.rpc("shift_deadline_series", { p_deadline_id: deadlineId, p_new_due_at: dueAt });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.shifted_id, due_at: new Date(row.shifted_due_at).toISOString(), course_id: row.shifted_course_id }));
}
