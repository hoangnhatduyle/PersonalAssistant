import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { occurrenceOverrideKeySchema, occurrenceOverridePayloadSchema } from "@/lib/api/schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { findSeriesOccurrence } from "@/lib/calendar/occurrence-overrides";
import type { MeetingBlock } from "@/lib/calendar/recurrence";
import { futureOverrideCutoff, hasPatternChanged } from "@/lib/api/series-pattern";

/** The PostgREST embed GET /api/courses and /api/appointments add to their selects so a client gets each series' exceptions in the same round trip. */
export const OCCURRENCE_OVERRIDES_EMBED =
  "occurrence_overrides(original_date, original_start_minutes, is_cancelled, new_date, new_start_minutes, new_end_minutes)";

type ParentTable = "courses" | "appointments";

const PARENT_COLUMN: Record<ParentTable, "course_id" | "appointment_id"> = {
  courses: "course_id",
  appointments: "appointment_id",
};

/** The two columns the natural key's unique index leads with, as PostgREST's on_conflict wants them. */
const CONFLICT_TARGET: Record<ParentTable, string> = {
  courses: "course_id,original_date,original_start_minutes",
  appointments: "appointment_id,original_date,original_start_minutes",
};

interface ParentSeries {
  id: string;
  meeting_blocks: MeetingBlock[];
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  category?: string | null;
}

/** The caller's live course/appointment with its pattern; null if it isn't theirs, is deleted, or doesn't exist. */
async function loadParent(supabase: SupabaseClient<Database>, userId: string, table: ParentTable, id: string) {
  const columns = table === "appointments" ? "id, meeting_blocks, recurrence_start_date, recurrence_end_date, category" : "id, meeting_blocks, recurrence_start_date, recurrence_end_date";
  const { data, error } = await supabase.from(table).select(columns).eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  return { parent: (data as unknown as ParentSeries | null) ?? null, error };
}

/**
 * PUT /api/{courses|appointments}/[id]/occurrences — records (or replaces) the
 * exception for ONE occurrence: cancel it, or move/resize it. The occurrence
 * must really be part of the series; the series row itself is never touched.
 */
export async function putOccurrenceOverride(table: ParentTable, id: string, request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = occurrenceOverridePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { parent, error: lookupError } = await loadParent(supabase, user.id, table, id);
  if (lookupError) return serverErrorResponse("recurring series lookup failed", lookupError);
  if (!parent) return notFoundResponse();
  if (table === "appointments" && (parent.meeting_blocks.length === 0 || parent.category === "Session")) {
    return validationErrorResponse("Only a recurring appointment has occurrences to change");
  }
  if (!findSeriesOccurrence(parent, parsed.data.original_date, parsed.data.original_start_minutes)) {
    return validationErrorResponse("That occurrence is not part of this recurring series");
  }

  const { data, error } = await supabase
    .from("occurrence_overrides")
    .upsert({ user_id: user.id, [PARENT_COLUMN[table]]: id, ...parsed.data }, { onConflict: CONFLICT_TARGET[table] })
    .select("original_date, original_start_minutes, is_cancelled, new_date, new_start_minutes, new_end_minutes")
    .single();
  if (error) return serverErrorResponse("occurrence override save failed", error);
  return successResponse(data);
}

/**
 * DELETE /api/{courses|appointments}/[id]/occurrences?original_date=&original_start_minutes=
 * — reverts one occurrence to what the series says. Idempotent: reverting an
 * occurrence that has no exception succeeds.
 */
export async function deleteOccurrenceOverride(table: ParentTable, id: string, request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const url = new URL(request.url);
  const parsed = occurrenceOverrideKeySchema.safeParse({
    original_date: url.searchParams.get("original_date"),
    original_start_minutes: url.searchParams.get("original_start_minutes"),
  });
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { parent, error: lookupError } = await loadParent(supabase, user.id, table, id);
  if (lookupError) return serverErrorResponse("recurring series lookup failed", lookupError);
  if (!parent) return notFoundResponse();

  const { error } = await supabase
    .from("occurrence_overrides")
    .delete()
    .eq(PARENT_COLUMN[table], id)
    .eq("user_id", user.id)
    .eq("original_date", parsed.data.original_date)
    .eq("original_start_minutes", parsed.data.original_start_minutes);
  if (error) return serverErrorResponse("occurrence override delete failed", error);
  return successResponse(parsed.data);
}

/**
 * Editing a series' pattern (its time windows or date range) makes its
 * exceptions meaningless — an override names "the 8:30 occurrence on Nov 5",
 * which may no longer exist, or may come back later and resurrect a stale
 * exception. So when a PATCH actually changes the pattern, the series' FUTURE
 * exceptions are dropped; past ones stay as history. A no-op PATCH (same
 * blocks resubmitted) keeps them.
 */
export async function clearFutureOverridesIfPatternChanged(
  supabase: SupabaseClient<Database>,
  table: ParentTable,
  id: string,
  before: Pick<ParentSeries, "meeting_blocks" | "recurrence_start_date" | "recurrence_end_date">,
  patch: { meeting_blocks?: MeetingBlock[]; recurrence_start_date?: string | null; recurrence_end_date?: string | null },
  now: Date = new Date(),
) {
  if (!hasPatternChanged(before, patch)) return null;

  const cutoff = futureOverrideCutoff(now);
  const { error } = await supabase.from("occurrence_overrides").delete().eq(PARENT_COLUMN[table], id).gte("original_date", cutoff);
  return error;
}
