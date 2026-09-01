import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DeadlinePatch, DeadlinePayload, NotePatch, NotePayload, TaskPatch, TaskPayload } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import { cascadeDeleteCourse, cascadeDeleteTask } from "@/lib/api/cascade";
import { resolveReminderTransition, type ReminderTransitionEvent } from "@/lib/api/transitions";

/**
 * SPEC-VOICE-005 shared_schemas' pending_mutation: the parsed target entity
 * type/id, operation, and payload persisted verbatim at AwaitingConfirmation
 * time (SPEC-API-005 AC-3) and executed unchanged on user_confirms (AC-6) —
 * never re-derived from a fresh intent-resolution pass. Must stay JSON-safe
 * (stored in voice_sessions.pending_mutation jsonb).
 */
export type PendingMutation =
  | { targetType: "course"; operation: "delete"; targetId: string }
  | { targetType: "deadline"; operation: "create"; payload: DeadlinePayload }
  | { targetType: "deadline"; operation: "update"; targetId: string; payload: DeadlinePatch }
  | { targetType: "deadline"; operation: "delete"; targetId: string }
  | { targetType: "task"; operation: "create"; payload: TaskPayload }
  | { targetType: "task"; operation: "update"; targetId: string; payload: TaskPatch }
  | { targetType: "task"; operation: "delete"; targetId: string }
  | { targetType: "note"; operation: "create"; payload: NotePayload }
  | { targetType: "note"; operation: "update"; targetId: string; payload: NotePatch }
  | { targetType: "note"; operation: "delete"; targetId: string }
  | { targetType: "reminder"; operation: "acknowledge"; targetId: string; event: ReminderTransitionEvent; snoozeUntil?: string };

export interface MutationExecutionResult {
  summary: string;
  data: unknown;
  cascade?: { deadlinesDeleted: number; remindersDismissed: number; notesUnlinked: number; todoItemsDeleted?: number };
}

/** Thrown when a pending_mutation's target no longer exists/is owned by the caller at execution time. */
export class MutationTargetNotFoundError extends Error {}

/**
 * soft_delete_course_cascade/soft_delete_task_cascade (supabase/migrations/
 * 0002_delete_cascade.sql) silently return all-zero counts for a
 * non-existent/foreign/already-deleted target rather than raising — the
 * existing REST routes (src/app/api/courses/[id]/route.ts, .../tasks/[id]/
 * route.ts) mask this by doing their own existence+ownership check first.
 * Architect-review finding: this path skipped that check, so a stale/
 * hallucinated/already-deleted target id would report "Deleted the course"
 * with executed:true despite nothing having happened — the same class of
 * false-success Item 4 was rejected over. Reproduce the REST routes' guard.
 */
async function assertLiveAndOwned(supabase: SupabaseClient<Database>, table: "courses" | "tasks", id: string, userId: string): Promise<void> {
  const { data, error } = await supabase.from(table).select("id").eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new MutationTargetNotFoundError(`${table} ${id} not found or already deleted`);
}

/**
 * SPEC-API-005 AC-6: executes exactly the pending_mutation persisted when
 * AwaitingConfirmation began, not a freshly re-parsed one — this function's
 * only inputs are that persisted object and the authenticated caller's own
 * user_id, never the original transcript.
 */
export async function executePendingMutation(
  supabase: SupabaseClient<Database>,
  userId: string,
  mutation: PendingMutation,
): Promise<MutationExecutionResult> {
  switch (mutation.targetType) {
    case "course": {
      await assertLiveAndOwned(supabase, "courses", mutation.targetId, userId);
      const cascade = await cascadeDeleteCourse(supabase, mutation.targetId);
      return {
        summary: `Deleted the course and ${cascade.deadlinesAffected} deadline(s).`,
        data: { id: mutation.targetId },
        cascade: {
          deadlinesDeleted: cascade.deadlinesAffected,
          remindersDismissed: cascade.remindersDismissed,
          notesUnlinked: cascade.notesUnlinked,
          todoItemsDeleted: cascade.todoItemsAffected,
        },
      };
    }

    case "deadline":
      return executeDeadlineMutation(supabase, userId, mutation);

    case "task":
      return executeTaskMutation(supabase, userId, mutation);

    case "note":
      return executeNoteMutation(supabase, userId, mutation);

    case "reminder":
      return executeReminderAck(supabase, userId, mutation);
  }
}

async function executeDeadlineMutation(
  supabase: SupabaseClient<Database>,
  userId: string,
  mutation: Extract<PendingMutation, { targetType: "deadline" }>,
): Promise<MutationExecutionResult> {
  if (mutation.operation === "delete") {
    // .select().maybeSingle() rather than a bare update: a target that
    // doesn't exist/isn't owned by the caller must fail loudly, not
    // silently affect 0 rows and still report "Deadline deleted." (per an
    // architect-review finding on this same false-success class of bug).
    const { data, error } = await supabase
      .from("deadlines")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mutation.targetId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new MutationTargetNotFoundError(`deadline ${mutation.targetId} not found or already deleted`);
    return { summary: "Deadline deleted.", data: { id: mutation.targetId } };
  }

  if (mutation.operation === "create") {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, reminders_enabled, reminder_lead_minutes")
      .eq("id", mutation.payload.course_id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .single();
    if (courseError) throw courseError;

    const { data: deadline, error } = await supabase
      .from("deadlines")
      .insert({ user_id: userId, ...mutation.payload })
      .select("*")
      .single();
    if (error) throw error;

    await syncReminderForTarget(supabase, {
      userId,
      targetType: "deadline",
      targetId: deadline.id,
      dueAt: deadline.due_at,
      remindersEnabled: course.reminders_enabled,
      reminderLeadMinutes: course.reminder_lead_minutes,
    });
    return { summary: `Created deadline "${deadline.title}".`, data: deadline };
  }

  // update
  const { data: existing, error: fetchError } = await supabase
    .from("deadlines")
    .select("id, course_id")
    .eq("id", mutation.targetId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();
  if (fetchError) throw fetchError;

  const { data: updated, error } = await supabase
    .from("deadlines")
    .update(mutation.payload)
    .eq("id", mutation.targetId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;

  if (mutation.payload.due_at !== undefined) {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("reminders_enabled, reminder_lead_minutes")
      .eq("id", existing.course_id)
      .single();
    if (courseError) throw courseError;

    await syncReminderForTarget(supabase, {
      userId,
      targetType: "deadline",
      targetId: mutation.targetId,
      dueAt: updated.due_at,
      remindersEnabled: course.reminders_enabled,
      reminderLeadMinutes: course.reminder_lead_minutes,
    });
  }
  return { summary: `Updated deadline "${updated.title}".`, data: updated };
}

async function executeTaskMutation(
  supabase: SupabaseClient<Database>,
  userId: string,
  mutation: Extract<PendingMutation, { targetType: "task" }>,
): Promise<MutationExecutionResult> {
  if (mutation.operation === "delete") {
    await assertLiveAndOwned(supabase, "tasks", mutation.targetId, userId);
    const cascade = await cascadeDeleteTask(supabase, mutation.targetId);
    return { summary: "Task deleted.", data: { id: mutation.targetId, notesUnlinked: cascade.notesUnlinked } };
  }

  if (mutation.operation === "create") {
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({ user_id: userId, ...mutation.payload })
      .select("*")
      .single();
    if (error) throw error;

    await syncReminderForTarget(supabase, {
      userId,
      targetType: "task",
      targetId: task.id,
      dueAt: task.due_at,
      remindersEnabled: task.reminders_enabled,
      reminderLeadMinutes: task.reminder_lead_minutes,
    });
    return { summary: `Created task "${task.title}".`, data: task };
  }

  // update
  const { data: updated, error } = await supabase
    .from("tasks")
    .update(mutation.payload)
    .eq("id", mutation.targetId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;

  const governanceTouched =
    mutation.payload.due_at !== undefined ||
    mutation.payload.reminders_enabled !== undefined ||
    mutation.payload.reminder_lead_minutes !== undefined;
  if (governanceTouched) {
    await syncReminderForTarget(supabase, {
      userId,
      targetType: "task",
      targetId: mutation.targetId,
      dueAt: updated.due_at,
      remindersEnabled: updated.reminders_enabled,
      reminderLeadMinutes: updated.reminder_lead_minutes,
    });
  }
  return { summary: `Updated task "${updated.title}".`, data: updated };
}

async function executeNoteMutation(
  supabase: SupabaseClient<Database>,
  userId: string,
  mutation: Extract<PendingMutation, { targetType: "note" }>,
): Promise<MutationExecutionResult> {
  if (mutation.operation === "delete") {
    const { data, error } = await supabase
      .from("notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mutation.targetId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new MutationTargetNotFoundError(`note ${mutation.targetId} not found or already deleted`);
    return { summary: "Note deleted.", data: { id: mutation.targetId } };
  }

  if (mutation.operation === "create") {
    const { data: note, error } = await supabase
      .from("notes")
      .insert({ user_id: userId, ...mutation.payload })
      .select("*")
      .single();
    if (error) throw error;
    return { summary: "Note created.", data: note };
  }

  const { data: updated, error } = await supabase
    .from("notes")
    .update(mutation.payload)
    .eq("id", mutation.targetId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return { summary: "Note updated.", data: updated };
}

async function executeReminderAck(
  supabase: SupabaseClient<Database>,
  userId: string,
  mutation: Extract<PendingMutation, { targetType: "reminder" }>,
): Promise<MutationExecutionResult> {
  // Mirrors src/app/api/reminders/[id]/ack/route.ts's own explicit guard —
  // intent.ts's schema already enforces this at resolution time, but this
  // is the actual execution boundary, so it gets the same defense in depth
  // every other branch here applies rather than trusting the caller.
  if (mutation.event === "user_snoozes" && !mutation.snoozeUntil) {
    throw new Error("snooze_until is required for user_snoozes");
  }

  const { data: existing, error: fetchError } = await supabase
    .from("reminders")
    .select("id, acknowledgment_state")
    .eq("id", mutation.targetId)
    .eq("user_id", userId)
    .single();
  if (fetchError) throw fetchError;

  const nextState = resolveReminderTransition(mutation.event, existing.acknowledgment_state);
  if (!nextState) {
    throw new Error(`Cannot apply "${mutation.event}" from state "${existing.acknowledgment_state}"`);
  }

  const update =
    mutation.event === "user_snoozes"
      ? { acknowledgment_state: nextState, snooze_until: mutation.snoozeUntil }
      : { acknowledgment_state: nextState };

  const { data: updated, error } = await supabase
    .from("reminders")
    .update(update)
    .eq("id", mutation.targetId)
    .eq("user_id", userId)
    .eq("acknowledgment_state", existing.acknowledgment_state)
    .select("*")
    .single();
  if (error) throw error;
  return { summary: `Reminder ${nextState.toLowerCase()}.`, data: updated };
}
