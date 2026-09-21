import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryApplicationEvent, LibraryInterview, LibraryInterviewWithPerson, LibraryTimelineEntry } from "@/lib/api/entity-types";
import type { LibraryInterviewPatch, LibraryInterviewPayload } from "@/lib/api/library-schemas";
import { buildTimeline, mapInterviewRow } from "@/lib/library/employer-mapper";
import { findMissingOwnedIds } from "@/lib/library/server/owned-ids";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type InterviewRow = Parameters<typeof mapInterviewRow>[0];

const INTERVIEW_SELECT = "*, interviewer:people(id,name,deleted_at)";

export type InterviewResult =
  | { ok: true; interview: LibraryInterviewWithPerson }
  | { ok: false; reason: "application_not_found" | "interviewer_not_found" | "not_found" };

async function applicationIsLive(supabase: Client, userId: string, applicationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function readInterview(supabase: Client, userId: string, id: string): Promise<LibraryInterviewWithPerson | null> {
  const { data, error } = await supabase
    .from("library_interviews")
    .select(INTERVIEW_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInterviewRow(data as unknown as InterviewRow) : null;
}

/** Interviews of one application, in the order they happen (unscheduled ones last). Null when the application isn't a live one of the caller's. */
export async function listInterviews(supabase: Client, userId: string, applicationId: string): Promise<LibraryInterviewWithPerson[] | null> {
  if (!(await applicationIsLive(supabase, userId, applicationId))) return null;

  const { data, error } = await supabase
    .from("library_interviews")
    .select(INTERVIEW_SELECT)
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as InterviewRow[]).map(mapInterviewRow);
}

export async function createInterview(
  supabase: Client,
  userId: string,
  applicationId: string,
  input: LibraryInterviewPayload,
): Promise<InterviewResult> {
  if (!(await applicationIsLive(supabase, userId, applicationId))) return { ok: false, reason: "application_not_found" };
  if (input.interviewer_person_id && (await findMissingOwnedIds(supabase, userId, "people", [input.interviewer_person_id])).length > 0) {
    return { ok: false, reason: "interviewer_not_found" };
  }

  const { data: created, error } = await supabase
    .from("library_interviews")
    .insert({ user_id: userId, application_id: applicationId, ...input })
    .select("id")
    .single();
  if (error) throw error;

  const interview = await readInterview(supabase, userId, created.id);
  if (!interview) throw new Error("created library interview could not be re-read");
  return { ok: true, interview };
}

export async function updateInterview(supabase: Client, userId: string, id: string, patch: LibraryInterviewPatch): Promise<InterviewResult> {
  const existing = await readInterview(supabase, userId, id);
  if (!existing) return { ok: false, reason: "not_found" };
  if (patch.interviewer_person_id && (await findMissingOwnedIds(supabase, userId, "people", [patch.interviewer_person_id])).length > 0) {
    return { ok: false, reason: "interviewer_not_found" };
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("library_interviews").update(patch).eq("id", id).eq("user_id", userId).is("deleted_at", null);
    if (error) throw error;
  }

  const interview = await readInterview(supabase, userId, id);
  return interview ? { ok: true, interview } : { ok: false, reason: "not_found" };
}

/** Soft delete. Returns false when the interview doesn't exist / isn't the caller's / is already deleted. */
export async function softDeleteInterview(supabase: Client, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_interviews")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Status history + interview log merged on one rail. Null when the application isn't a live one of the caller's. */
export async function getApplicationTimeline(supabase: Client, userId: string, applicationId: string): Promise<LibraryTimelineEntry[] | null> {
  const interviews = await listInterviews(supabase, userId, applicationId);
  if (!interviews) return null;

  const { data, error } = await supabase
    .from("library_application_events")
    .select("*")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return buildTimeline((data ?? []) as LibraryApplicationEvent[], interviews);
}

export type { LibraryInterview };
