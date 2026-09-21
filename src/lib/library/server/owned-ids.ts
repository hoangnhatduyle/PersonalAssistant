import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Returns the ids in `ids` that are NOT live rows of `table` owned by
 * `userId`. Defence in depth before a sync_* RPC (the link-table guard
 * triggers backstop it row by row).
 */
export async function findMissingOwnedIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  table: "people" | "courses" | "library_employers",
  ids: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", unique);
  if (error) throw error;

  const found = new Set((data ?? []).map((row) => row.id));
  return unique.filter((id) => !found.has(id));
}
