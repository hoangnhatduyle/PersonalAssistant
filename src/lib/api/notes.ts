import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** AC-4: a Note may only link to a Course/Task the caller owns. */
export async function ownsNoteLinkTargets(
  supabase: SupabaseClient<Database>,
  userId: string,
  linkedCourseId?: string | null,
  linkedTaskId?: string | null,
): Promise<boolean> {
  if (linkedCourseId) {
    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("id", linkedCourseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return false;
  }
  if (linkedTaskId) {
    const { data } = await supabase.from("tasks").select("id").eq("id", linkedTaskId).eq("user_id", userId).maybeSingle();
    if (!data) return false;
  }
  return true;
}
