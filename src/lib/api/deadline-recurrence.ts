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
