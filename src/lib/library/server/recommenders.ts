import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryRecommender, LibraryRecommenderLetter } from "@/lib/api/entity-types";
import type {
  LibraryRecommenderLetterPatch,
  LibraryRecommenderLetterPayload,
  LibraryRecommenderPatch,
  LibraryRecommenderPayload,
} from "@/lib/api/library-schemas";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type RecommenderRow = Database["public"]["Tables"]["library_recommenders"]["Row"];
type LetterRow = Database["public"]["Tables"]["library_recommender_letters"]["Row"];

const SELECT = "*, letters:library_recommender_letters(*)";

/** Newest letter first, so the one in flight (or the latest received) leads the card. */
function byNewest(a: LetterRow, b: LetterRow): number {
  return b.created_at.localeCompare(a.created_at);
}

function mapRecommender(row: RecommenderRow & { letters: LetterRow[] | null }): LibraryRecommender {
  return {
    ...row,
    status: row.status as LibraryRecommender["status"],
    letters: [...(row.letters ?? [])].sort(byNewest) as LibraryRecommenderLetter[],
  };
}

export async function listRecommenders(supabase: Client, userId: string): Promise<LibraryRecommender[]> {
  const { data, error } = await supabase
    .from("library_recommenders")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as (RecommenderRow & { letters: LetterRow[] | null })[]).map(mapRecommender);
}

async function readRecommender(supabase: Client, userId: string, id: string): Promise<LibraryRecommender | null> {
  const { data, error } = await supabase.from("library_recommenders").select(SELECT).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapRecommender(data as unknown as RecommenderRow & { letters: LetterRow[] | null }) : null;
}

export async function createRecommender(supabase: Client, userId: string, input: LibraryRecommenderPayload): Promise<LibraryRecommender> {
  const { data, error } = await supabase.from("library_recommenders").insert({ user_id: userId, ...input }).select("id").single();
  if (error) throw error;
  const created = await readRecommender(supabase, userId, data.id);
  if (!created) throw new Error("created recommender could not be re-read");
  return created;
}

/** Null when the recommender doesn't exist / isn't the caller's. */
export async function updateRecommender(supabase: Client, userId: string, id: string, patch: LibraryRecommenderPatch): Promise<LibraryRecommender | null> {
  const { data, error } = await supabase.from("library_recommenders").update(patch).eq("id", id).eq("user_id", userId).select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) return null;
  return readRecommender(supabase, userId, id);
}

/** Letters cascade. False when the recommender doesn't exist / isn't the caller's. */
export async function deleteRecommender(supabase: Client, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("library_recommenders").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Null when the recommender isn't the caller's. */
export async function createLetter(
  supabase: Client,
  userId: string,
  recommenderId: string,
  input: LibraryRecommenderLetterPayload,
): Promise<LibraryRecommenderLetter | null> {
  if (!(await readRecommender(supabase, userId, recommenderId))) return null;
  const { data, error } = await supabase
    .from("library_recommender_letters")
    .insert({ user_id: userId, recommender_id: recommenderId, ...input })
    .select("*")
    .single();
  if (error) throw error;
  return data as LibraryRecommenderLetter;
}

export async function updateLetter(
  supabase: Client,
  userId: string,
  id: string,
  patch: LibraryRecommenderLetterPatch,
): Promise<LibraryRecommenderLetter | null> {
  const { data, error } = await supabase
    .from("library_recommender_letters")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as LibraryRecommenderLetter | null;
}

export async function deleteLetter(supabase: Client, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("library_recommender_letters").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
