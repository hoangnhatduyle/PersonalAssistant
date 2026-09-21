import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryApplicationWithEmployer } from "@/lib/api/entity-types";
import type { LibraryApplicationPatch, LibraryApplicationPayload } from "@/lib/api/library-schemas";
import { resolveApplicationTransition } from "@/lib/api/transitions";
import type { ApplicationStatus } from "@/lib/library/application-status";
import { APPLICATION_LIST_MAX_LIMIT } from "@/lib/library/constants";
import { mapApplicationWithEmployer } from "@/lib/library/employer-mapper";
import { UNIQUE_VIOLATION } from "@/lib/library/server/pg-errors";
import { isValidSalaryRange } from "@/lib/library/salary";
import { normalizeJobUrl } from "@/lib/library/url";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type ApplicationRow = Parameters<typeof mapApplicationWithEmployer>[0];

const APPLICATION_SELECT = "*, employer:library_employers(id,name,deleted_at)";

export interface ApplicationFilters {
  status?: ApplicationStatus;
  employerId?: string;
  page?: number;
  limit?: number;
}

export type ApplicationResult =
  | { ok: true; application: LibraryApplicationWithEmployer }
  | { ok: false; reason: "not_found" | "employer_not_found" | "invalid_salary" | "unchanged" }
  | { ok: false; reason: "conflict"; existingId: string | null };

/** Page of applications, most recently moved first — what the pipeline board renders (limit up to 100). */
export async function listApplications(
  supabase: Client,
  userId: string,
  filters: ApplicationFilters,
): Promise<{ rows: LibraryApplicationWithEmployer[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = Math.min(APPLICATION_LIST_MAX_LIMIT, filters.limit ?? 20);
  const from = (page - 1) * limit;

  let query = supabase
    .from("library_applications")
    .select(APPLICATION_SELECT, { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.employerId) query = query.eq("employer_id", filters.employerId);

  const { data, count, error } = await query
    .order("status_changed_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + limit - 1);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as ApplicationRow[]).flatMap((row) => mapApplicationWithEmployer(row) ?? []);
  return { rows, total: count ?? 0, page, limit };
}

export async function getApplication(
  supabase: Client,
  userId: string,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<LibraryApplicationWithEmployer | null> {
  let query = supabase.from("library_applications").select(APPLICATION_SELECT).eq("id", id).eq("user_id", userId);
  if (!options.includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapApplicationWithEmployer(data as unknown as ApplicationRow) : null;
}

function jobUrlColumns(url: string | null): { job_url: string | null; normalized_job_url: string | null } {
  return url === null ? { job_url: null, normalized_job_url: null } : { job_url: url, normalized_job_url: normalizeJobUrl(url) };
}

async function findApplicationIdByJobUrl(supabase: Client, userId: string, normalized: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("library_applications")
    .select("id")
    .eq("user_id", userId)
    .eq("normalized_job_url", normalized)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function createApplication(supabase: Client, userId: string, input: LibraryApplicationPayload): Promise<ApplicationResult> {
  const { job_url, ...fields } = input;

  const { data: employer, error: employerError } = await supabase
    .from("library_employers")
    .select("id")
    .eq("id", input.employer_id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (employerError) throw employerError;
  if (!employer) return { ok: false, reason: "employer_not_found" };

  const columns = jobUrlColumns(job_url ?? null);
  const { data: created, error } = await supabase
    .from("library_applications")
    .insert({ user_id: userId, ...fields, ...columns })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION && columns.normalized_job_url) {
      return { ok: false, reason: "conflict", existingId: await findApplicationIdByJobUrl(supabase, userId, columns.normalized_job_url) };
    }
    throw error;
  }

  const application = await getApplication(supabase, userId, created.id);
  if (!application) throw new Error("created library application could not be re-read");
  return { ok: true, application };
}

/**
 * Columns a PATCH may never write, even if a caller smuggles them past the
 * zod schema: status moves only through transitionApplication (NC-API-002),
 * the rest are identity/bookkeeping.
 */
const PROTECTED_COLUMNS = new Set(["id", "user_id", "employer_id", "status", "status_changed_at", "created_at", "updated_at", "deleted_at"]);

function stripProtectedColumns<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !PROTECTED_COLUMNS.has(key))) as T;
}

export async function updateApplication(supabase: Client, userId: string, id: string, patch: LibraryApplicationPatch): Promise<ApplicationResult> {
  const { job_url, ...fields } = stripProtectedColumns(patch);

  const existing = await getApplication(supabase, userId, id);
  if (!existing) return { ok: false, reason: "not_found" };

  // A PATCH may set only one side of the range: check the merged result (the DB check is the backstop).
  const min = patch.salary_min === undefined ? existing.salary_min : patch.salary_min;
  const max = patch.salary_max === undefined ? existing.salary_max : patch.salary_max;
  if (!isValidSalaryRange(min ?? null, max ?? null)) return { ok: false, reason: "invalid_salary" };

  const update: Database["public"]["Tables"]["library_applications"]["Update"] = { ...fields };
  if (job_url !== undefined) Object.assign(update, jobUrlColumns(job_url));

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("library_applications").update(update).eq("id", id).eq("user_id", userId).is("deleted_at", null);
    if (error) {
      const normalized = job_url ? normalizeJobUrl(job_url) : null;
      if (error.code === UNIQUE_VIOLATION && normalized) {
        return { ok: false, reason: "conflict", existingId: await findApplicationIdByJobUrl(supabase, userId, normalized) };
      }
      throw error;
    }
  }

  const application = await getApplication(supabase, userId, id);
  return application ? { ok: true, application } : { ok: false, reason: "not_found" };
}

/**
 * NC-API-002: the only path that changes an application's status. Any status
 * may move to any other; a no-op move is `unchanged` (the route answers 400).
 * The DB triggers stamp status_changed_at and append the history event.
 */
export async function transitionApplication(supabase: Client, userId: string, id: string, to: ApplicationStatus): Promise<ApplicationResult> {
  const existing = await getApplication(supabase, userId, id);
  if (!existing) return { ok: false, reason: "not_found" };

  const next = resolveApplicationTransition(to, existing.status);
  if (next === null) return { ok: false, reason: "unchanged" };

  const { error } = await supabase.from("library_applications").update({ status: next }).eq("id", id).eq("user_id", userId).is("deleted_at", null);
  if (error) throw error;

  const application = await getApplication(supabase, userId, id);
  return application ? { ok: true, application } : { ok: false, reason: "not_found" };
}

/** Soft delete. Returns false when the application doesn't exist / isn't the caller's / is already deleted. */
export async function softDeleteApplication(supabase: Client, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_applications")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
