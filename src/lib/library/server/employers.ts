import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryEmployerDetail, LibraryEmployerListItem } from "@/lib/api/entity-types";
import type { LibraryEmployerPatch, LibraryEmployerPayload } from "@/lib/api/library-schemas";
import { EMPLOYER_LIST_MAX_LIMIT } from "@/lib/library/constants";
import type { LibraryEmployerFilters } from "@/lib/library/employer-filters";
import { mapEmployerDetailRow, mapEmployerListRow, type EmployerDetailRow, type EmployerListRow } from "@/lib/library/employer-mapper";
import { UNIQUE_VIOLATION } from "@/lib/library/server/pg-errors";
import { buildEmployerSearchOrFilters } from "@/lib/library/search";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

const APPLICATIONS_SUMMARY_EMBED = "library_applications(id,title,status,status_changed_at,deleted_at)";
const CONTACTS_EMBED = "library_employer_contacts(kind,note,person:people(id,name,deleted_at))";
const POSTS_EMBED = "library_post_employers(post:library_posts(id,title,platform,deleted_at))";

const LIST_SELECT = `*, ${APPLICATIONS_SUMMARY_EMBED}, ${CONTACTS_EMBED}`;
const DETAIL_SELECT = `*, library_applications(*), ${CONTACTS_EMBED}, ${POSTS_EMBED}`;

export type EmployerResult =
  | { ok: true; employer: LibraryEmployerDetail }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict"; existingId: string | null };

export interface EmployerCascadeCounts {
  applications: number;
  interviews: number;
  contacts: number;
  postLinks: number;
}

/**
 * Page of employers, newest first. `status` narrows to employers that have a
 * live application in that status; it is done through a separate aliased
 * `!inner` embed (`match`) so the regular `library_applications` embed — and
 * therefore the funnel/stepper — still shows ALL of an employer's roles.
 */
export async function listEmployers(
  supabase: Client,
  userId: string,
  filters: LibraryEmployerFilters,
): Promise<{ rows: LibraryEmployerListItem[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = Math.min(EMPLOYER_LIST_MAX_LIMIT, filters.limit ?? 20);
  const from = (page - 1) * limit;

  let query = supabase
    .from("library_employers")
    .select(filters.status ? `${LIST_SELECT}, match:library_applications!inner(id)` : LIST_SELECT, { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (filters.status) query = query.eq("match.status", filters.status).is("match.deleted_at", null);
  if (filters.archived === "only") query = query.not("archived_at", "is", null);
  else if (filters.archived !== "all") query = query.is("archived_at", null);
  for (const group of buildEmployerSearchOrFilters(filters.q ?? "")) query = query.or(group);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + limit - 1);
  if (error) throw error;

  return { rows: ((data ?? []) as unknown as EmployerListRow[]).map(mapEmployerListRow), total: count ?? 0, page, limit };
}

export async function getEmployer(
  supabase: Client,
  userId: string,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<LibraryEmployerDetail | null> {
  let query = supabase.from("library_employers").select(DETAIL_SELECT).eq("id", id).eq("user_id", userId);
  if (!options.includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapEmployerDetailRow(data as unknown as EmployerDetailRow) : null;
}

async function findEmployerIdByName(supabase: Client, userId: string, name: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("library_employers")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name.replace(/[\\%_]/g, (char) => `\\${char}`))
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function createEmployer(supabase: Client, userId: string, input: LibraryEmployerPayload): Promise<EmployerResult> {
  const { data: created, error } = await supabase
    .from("library_employers")
    .insert({ user_id: userId, ...input })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: "conflict", existingId: await findEmployerIdByName(supabase, userId, input.name) };
    }
    throw error;
  }
  const employer = await getEmployer(supabase, userId, created.id);
  if (!employer) throw new Error("created library employer could not be re-read");
  return { ok: true, employer };
}

export async function updateEmployer(supabase: Client, userId: string, id: string, patch: LibraryEmployerPatch): Promise<EmployerResult> {
  const { archived, ...fields } = patch;

  const existing = await getEmployer(supabase, userId, id);
  if (!existing) return { ok: false, reason: "not_found" };

  const update: Database["public"]["Tables"]["library_employers"]["Update"] = { ...fields };
  if (archived !== undefined) update.archived_at = archived ? (existing.archived_at ?? new Date().toISOString()) : null;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("library_employers").update(update).eq("id", id).eq("user_id", userId).is("deleted_at", null);
    if (error) {
      if (error.code === UNIQUE_VIOLATION && fields.name) {
        return { ok: false, reason: "conflict", existingId: await findEmployerIdByName(supabase, userId, fields.name) };
      }
      throw error;
    }
  }

  const employer = await getEmployer(supabase, userId, id);
  return employer ? { ok: true, employer } : { ok: false, reason: "not_found" };
}

/**
 * Soft delete through Library's own cascade RPC (employer + applications +
 * interviews soft-deleted, contacts and post links removed). Null when the
 * employer doesn't exist / isn't the caller's / is already deleted.
 */
export async function softDeleteEmployer(supabase: Client, userId: string, id: string): Promise<EmployerCascadeCounts | null> {
  // The RPC answers all-zeros for a missing employer too, so existence is checked first.
  const { data: existing, error: lookupError } = await supabase
    .from("library_employers")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) return null;

  const { data, error } = await supabase.rpc("soft_delete_library_employer_cascade", { p_employer_id: id });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    applications: row.applications_affected,
    interviews: row.interviews_affected,
    contacts: row.contacts_removed,
    postLinks: row.post_links_removed,
  };
}
