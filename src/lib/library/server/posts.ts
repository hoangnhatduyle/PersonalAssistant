import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryPostWithRelations } from "@/lib/api/entity-types";
import type { LibraryPostPatch, LibraryPostPayload } from "@/lib/api/library-schemas";
import { POST_LIST_MAX_LIMIT } from "@/lib/library/constants";
import type { LibraryPostFilters } from "@/lib/library/filters";
import { mapPostRow, type LibraryPostRow } from "@/lib/library/link-mapper";
import { buildPostSearchOrFilters } from "@/lib/library/search";
import { findMissingOwnedIds } from "@/lib/library/server/owned-ids";
import { UNIQUE_VIOLATION } from "@/lib/library/server/pg-errors";
import { detectPlatform, normalizePostUrl } from "@/lib/library/url";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;



const PEOPLE_EMBED = "library_post_people(person:people(id,name,deleted_at))";
const COURSES_EMBED = "library_post_courses(course:courses(id,name,code,deleted_at))";
const EMPLOYERS_EMBED = "library_post_employers(employer:library_employers(id,name,deleted_at))";
const IMAGES_EMBED = "images:library_post_images(*)";
const POST_SELECT = `*, ${IMAGES_EMBED}, ${PEOPLE_EMBED}, ${COURSES_EMBED}, ${EMPLOYERS_EMBED}`;

export type PostFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "link_not_found" }
  | { ok: false; reason: "conflict"; existingId: string | null };

export type PostResult = { ok: true; post: LibraryPostWithRelations } | PostFailure;

/** Page of posts, newest first. personId/courseId/employerId use !inner so only linked posts survive. */
export async function listPosts(
  supabase: Client,
  userId: string,
  filters: LibraryPostFilters,
): Promise<{ rows: LibraryPostWithRelations[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = Math.min(POST_LIST_MAX_LIMIT, filters.limit ?? 20);
  const from = (page - 1) * limit;

  const peopleEmbed = filters.personId ? PEOPLE_EMBED.replace("library_post_people(", "library_post_people!inner(") : PEOPLE_EMBED;
  const coursesEmbed = filters.courseId ? COURSES_EMBED.replace("library_post_courses(", "library_post_courses!inner(") : COURSES_EMBED;

  const employersEmbed = filters.employerId ? EMPLOYERS_EMBED.replace("library_post_employers(", "library_post_employers!inner(") : EMPLOYERS_EMBED;

  let query = supabase
    .from("library_posts")
    .select(`*, ${IMAGES_EMBED}, ${peopleEmbed}, ${coursesEmbed}, ${employersEmbed}`, { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.favorite) query = query.eq("is_favorite", true);
  if (filters.archived === "only") query = query.not("archived_at", "is", null);
  else if (filters.archived !== "all") query = query.is("archived_at", null);
  if (filters.tags && filters.tags.length > 0) query = query.contains("tags", filters.tags);
  if (filters.personId) query = query.eq("library_post_people.person_id", filters.personId);
  if (filters.courseId) query = query.eq("library_post_courses.course_id", filters.courseId);
  if (filters.employerId) query = query.eq("library_post_employers.employer_id", filters.employerId);
  for (const group of buildPostSearchOrFilters(filters.q ?? "")) query = query.or(group);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + limit - 1);
  if (error) throw error;

  return { rows: ((data ?? []) as unknown as LibraryPostRow[]).map(mapPostRow), total: count ?? 0, page, limit };
}

export async function getPost(
  supabase: Client,
  userId: string,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<LibraryPostWithRelations | null> {
  let query = supabase.from("library_posts").select(POST_SELECT).eq("id", id).eq("user_id", userId);
  if (!options.includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapPostRow(data as unknown as LibraryPostRow) : null;
}

async function findPostIdByNormalizedUrl(supabase: Client, userId: string, normalizedUrl: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("library_posts")
    .select("id")
    .eq("user_id", userId)
    .eq("normalized_url", normalizedUrl)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

type LinkIds = { person_ids?: string[]; course_ids?: string[]; employer_ids?: string[] };

/** True when any provided link id is not a live row of the caller's (defence in depth before the sync RPCs). */
async function hasForeignLinkIds(supabase: Client, userId: string, links: LinkIds): Promise<boolean> {
  const checks: [string[] | undefined, "people" | "courses" | "library_employers"][] = [
    [links.person_ids, "people"],
    [links.course_ids, "courses"],
    [links.employer_ids, "library_employers"],
  ];
  for (const [ids, table] of checks) {
    if (ids && (await findMissingOwnedIds(supabase, userId, table, ids)).length > 0) return true;
  }
  return false;
}

/** Ownership-checks the ids, then atomically replaces the post's link sets (only the ones provided). */
export async function syncLinks(
  supabase: Client,
  userId: string,
  postId: string,
  links: LinkIds,
): Promise<{ ok: true } | { ok: false; reason: "link_not_found" }> {
  if (await hasForeignLinkIds(supabase, userId, links)) return { ok: false, reason: "link_not_found" };

  if (links.person_ids) {
    const { error } = await supabase.rpc("sync_library_post_people", { p_post_id: postId, p_person_ids: links.person_ids });
    if (error) throw error;
  }
  if (links.course_ids) {
    const { error } = await supabase.rpc("sync_library_post_courses", { p_post_id: postId, p_course_ids: links.course_ids });
    if (error) throw error;
  }
  if (links.employer_ids) {
    const { error } = await supabase.rpc("sync_library_post_employers", { p_post_id: postId, p_employer_ids: links.employer_ids });
    if (error) throw error;
  }
  return { ok: true };
}

function urlColumns(url: string | null): { url: string | null; normalized_url: string | null; platform: "facebook" | "instagram" | "other" } {
  if (url === null) return { url: null, normalized_url: null, platform: "other" };
  return { url, normalized_url: normalizePostUrl(url), platform: detectPlatform(url) };
}

export async function createPost(supabase: Client, userId: string, input: LibraryPostPayload): Promise<PostResult> {
  const { person_ids, course_ids, employer_ids, url, ...fields } = input;
  const links = { person_ids, course_ids, employer_ids };

  // Fail before inserting anything if a linked person/course/employer isn't the caller's.
  if (await hasForeignLinkIds(supabase, userId, links)) return { ok: false, reason: "link_not_found" };

  const columns = urlColumns(url ?? null);
  const { data: created, error } = await supabase
    .from("library_posts")
    .insert({ user_id: userId, ...fields, ...columns })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION && columns.normalized_url) {
      return { ok: false, reason: "conflict", existingId: await findPostIdByNormalizedUrl(supabase, userId, columns.normalized_url) };
    }
    throw error;
  }

  try {
    await syncLinks(supabase, userId, created.id, links);
  } catch (linkError) {
    // supabase-js has no client transaction: don't leave a half-linked post behind.
    await supabase.from("library_posts").update({ deleted_at: new Date().toISOString() }).eq("id", created.id);
    throw linkError;
  }

  const post = await getPost(supabase, userId, created.id);
  if (!post) throw new Error("created library post could not be re-read");
  return { ok: true, post };
}

export async function updatePost(supabase: Client, userId: string, id: string, patch: LibraryPostPatch): Promise<PostResult> {
  const { person_ids, course_ids, employer_ids, archived, url, ...fields } = patch;

  const existing = await getPost(supabase, userId, id);
  if (!existing) return { ok: false, reason: "not_found" };

  const links = { person_ids, course_ids, employer_ids };
  // Validate link ownership up front so a bad id never leaves a half-applied patch.
  if (await hasForeignLinkIds(supabase, userId, links)) return { ok: false, reason: "link_not_found" };

  const update: Database["public"]["Tables"]["library_posts"]["Update"] = { ...fields };
  if (url !== undefined) Object.assign(update, urlColumns(url));
  if (archived !== undefined) update.archived_at = archived ? (existing.archived_at ?? new Date().toISOString()) : null;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("library_posts").update(update).eq("id", id).eq("user_id", userId).is("deleted_at", null);
    if (error) {
      const normalized = url ? normalizePostUrl(url) : null;
      if (error.code === UNIQUE_VIOLATION && normalized) {
        return { ok: false, reason: "conflict", existingId: await findPostIdByNormalizedUrl(supabase, userId, normalized) };
      }
      throw error;
    }
  }

  const synced = await syncLinks(supabase, userId, id, links);
  if (!synced.ok) return synced;

  const post = await getPost(supabase, userId, id);
  if (!post) return { ok: false, reason: "not_found" };
  return { ok: true, post };
}

/** Soft delete. Returns false when the post doesn't exist / isn't the caller's / is already deleted. */
export async function softDeletePost(supabase: Client, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function listTagCounts(supabase: Client): Promise<{ tag: string; n: number }[]> {
  const { data, error } = await supabase.rpc("library_post_tag_counts");
  if (error) throw error;
  return (data ?? []).map((row) => ({ tag: row.tag, n: Number(row.n) }));
}
