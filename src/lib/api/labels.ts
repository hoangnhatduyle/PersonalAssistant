import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** Shared by both GET /api/tasks and GET /api/tasks/[id] (Phase 3: Labels). */
export const TASK_SELECT_WITH_LABELS = "*, task_labels(label:labels(id,name,color))";

/**
 * A Task's label_ids may only reference Labels the caller owns — checked
 * once here before calling sync_task_labels (guard_task_label_ownership,
 * supabase/migrations/0031_labels.sql, backstops it row-by-row too).
 */
export async function ownsLabelIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  labelIds: string[],
): Promise<boolean> {
  if (labelIds.length === 0) return true;

  const { data, error } = await supabase
    .from("labels")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", labelIds);
  if (error) throw error;

  return new Set(data.map((row) => row.id)).size === new Set(labelIds).size;
}
