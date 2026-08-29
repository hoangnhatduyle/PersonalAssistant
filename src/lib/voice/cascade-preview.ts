import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface CourseDeleteCascadePreview {
  deadlinesAffected: number;
  remindersLive: number;
  notesAffected: number;
}

/**
 * SPEC-VOICE-005 AC-8, NC-VOICE-006: a read-only count of what a Course
 * delete would affect, computed at AwaitingConfirmation time so the
 * confirmation prompt can disclose it *before* the user confirms — distinct
 * from cascadeDeleteCourse (src/lib/api/cascade.ts), which performs the
 * mutation and reports what it actually affected, after the fact. Tracked
 * debt: SPEC-API-004 AC-6 only guaranteed the confirmed mutation executes
 * exactly as shown; this is what makes the "as shown" part honest for a
 * cascading delete.
 */
export async function previewCourseDeleteCascade(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
): Promise<CourseDeleteCascadePreview> {
  const [{ data: deadlines, error }, { count: notesAffected, error: notesError }] = await Promise.all([
    supabase.from("deadlines").select("id").eq("course_id", courseId).eq("user_id", userId).is("deleted_at", null),
    // Matches soft_delete_course_cascade's own unlink query (supabase/migrations/
    // 0002_delete_cascade.sql): scoped by linked_course_id only, not filtered
    // on the note's own deleted_at — a soft-deleted note's link is still
    // cleared by that cascade, so this count must include it too.
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("linked_course_id", courseId).eq("user_id", userId),
  ]);
  if (error) throw error;
  if (notesError) throw notesError;

  const deadlineIds = (deadlines ?? []).map((d) => d.id);
  if (deadlineIds.length === 0) {
    return { deadlinesAffected: 0, remindersLive: 0, notesAffected: notesAffected ?? 0 };
  }

  const { count, error: countError } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "deadline")
    .in("target_id", deadlineIds)
    .in("acknowledgment_state", ["Scheduled", "Snoozed"]);
  if (countError) throw countError;

  return { deadlinesAffected: deadlineIds.length, remindersLive: count ?? 0, notesAffected: notesAffected ?? 0 };
}

/**
 * Renders the disclosure clause the AwaitingConfirmation prompt states.
 * Architect-review finding: the zero-deadline case used to add "so nothing
 * else will be affected" — a false universal claim, since a course with no
 * live deadlines can still have notes linked to it that the cascade unlinks.
 */
export function formatCascadeDisclosure(preview: CourseDeleteCascadePreview): string {
  const clauses: string[] = [];
  if (preview.deadlinesAffected > 0) {
    const deadlineWord = preview.deadlinesAffected === 1 ? "deadline" : "deadlines";
    const reminderWord = preview.remindersLive === 1 ? "reminder" : "reminders";
    clauses.push(`remove ${preview.deadlinesAffected} ${deadlineWord} and dismiss ${preview.remindersLive} ${reminderWord}`);
  }
  if (preview.notesAffected > 0) {
    const noteWord = preview.notesAffected === 1 ? "note" : "notes";
    clauses.push(`unlink it from ${preview.notesAffected} ${noteWord}`);
  }
  if (clauses.length === 0) {
    return "It has no deadlines or linked notes.";
  }
  return `This will also ${clauses.join(" and ")}.`;
}
