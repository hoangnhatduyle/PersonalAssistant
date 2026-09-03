import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import type { PendingMutation } from "@/lib/voice/mutations";

// Shared across the deadline/task mutation variants below — mirrors
// supabase/migrations/0021_item_priority.sql's item_priority enum. A bare
// z.string() previously let the LLM emit any free text, which could fail
// the DB insert/update once the column became a strict enum.
//
// .default(null): gpt-4o-mini's JSON mode is not fully reliable about
// including every declared key when it has nothing to report for it —
// verified directly (a live "remind me to buy textbooks tomorrow at 5pm"
// call, no priority mentioned) that it sometimes omits `priority` entirely
// rather than emitting `null`, which a bare `.nullable()` (required key)
// rejects outright. Tolerate the omission as equivalent to null; an
// explicitly-provided invalid value is still rejected.
const itemPriorityMutationSchema = z.enum(["Low", "Medium", "High", "Urgent"]).nullable().default(null);

const mutationSchemaBase = z.discriminatedUnion("target_type", [
  z.object({ target_type: z.literal("course"), operation: z.literal("delete"), target_id: z.uuid() }),
  z.object({
    target_type: z.literal("deadline"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    course_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    priority: itemPriorityMutationSchema,
  }),
  z.object({
    target_type: z.literal("task"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    // null = no reminder-timing phrase present in the request (e.g. plain
    // "add a task to buy milk" with no "remind me" wording). 0 = an explicit
    // "remind me AT <time>" phrasing, meaning the reminder should fire
    // exactly at due_at rather than some minutes before it.
    reminder_lead_minutes: z.number().int().min(0).max(1440).nullable(),
    priority: itemPriorityMutationSchema,
  }),
  z.object({
    target_type: z.literal("note"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    body: z.string().nullable(),
  }),
  z.object({
    target_type: z.literal("reminder"),
    operation: z.literal("acknowledge"),
    target_id: z.uuid(),
    event: z.enum(["user_acknowledges", "user_dismisses", "user_snoozes"]),
    snooze_until: z.iso.datetime({ offset: true }).nullable(),
  }),
]);

// Review finding (code/typescript/security reviewers, independently):
// target_id and the per-entity fields were nullable regardless of
// `operation`, relying on toPendingMutation's `!` non-null assertions
// (compile-time only) to keep a null value out of a PendingMutation.
// Enforce every such invariant in the schema itself instead, so a
// schema-violating LLM response fails validation cleanly rather than
// producing a runtime `null` typed as `string`.
export const mutationSchema = mutationSchemaBase.superRefine((value, ctx) => {
  if (value.target_type === "course") return;

  if (value.target_type === "reminder") {
    if (value.event === "user_snoozes" && !value.snooze_until) {
      ctx.addIssue({ code: "custom", message: "snooze_until is required for user_snoozes", path: ["snooze_until"] });
    }
    return;
  }

  if (value.operation !== "create" && value.target_id === null) {
    ctx.addIssue({ code: "custom", message: `target_id is required when operation is "${value.operation}"`, path: ["target_id"] });
    return;
  }

  if (value.operation === "create") {
    if (value.target_type === "deadline" && (!value.course_id || !value.title || !value.due_at)) {
      ctx.addIssue({ code: "custom", message: "course_id, title, and due_at are required to create a deadline", path: ["title"] });
    }
    if (value.target_type === "task" && !value.title) {
      ctx.addIssue({ code: "custom", message: "title is required to create a task", path: ["title"] });
    }
    if (value.target_type === "note" && !value.body) {
      ctx.addIssue({ code: "custom", message: "body is required to create a note", path: ["body"] });
    }
  }
});

export type RawMutation = z.infer<typeof mutationSchema>;

export interface EntityContext {
  courses: Array<{ id: string; name: string }>;
  deadlines: Array<{ id: string; title: string; course_id: string }>;
  tasks: Array<{ id: string; title: string }>;
  // Bug fix: without this, mutation-vs-read-only classification had zero
  // visibility into what the user's knowledge base actually contains, so a
  // request naming a saved source by its own title/topic (e.g. "test the
  // bucket list" against a source titled "My Girlfriend (Tien) Bucket
  // List") had no anchor to recognize it as a read-only lookup — it fell
  // back to treating the bare imperative as an instruction to create a
  // task literally titled that. Titles only (no content) — same shape/cost
  // as the courses/deadlines/tasks lists above, just enough for the model
  // to match a reference.
  knowledgeSources: Array<{ id: string; title: string }>;
}

export async function loadEntityContext(supabase: SupabaseClient<Database>, userId: string): Promise<EntityContext> {
  // person_id IS NULL excludes rows tagged to a tracked Person (0013_people.sql
  // -- e.g. a family member's courses/tasks/deadlines an account owner tracks
  // under their own user_id). Without this, a mutation (or, since the 2h
  // merge, any conversational turn) could reference or target another
  // tracked person's item by id — mirrors the same filter in
  // src/lib/voice/schedule-loader.ts's loadSchedule and
  // src/app/api/intelligence/route.ts.
  const [{ data: courses }, { data: deadlines }, { data: tasks }, { data: knowledgeSources }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("user_id", userId).is("person_id", null).is("deleted_at", null),
    supabase.from("deadlines").select("id, title, course_id").eq("user_id", userId).is("person_id", null).is("deleted_at", null),
    supabase.from("tasks").select("id, title").eq("user_id", userId).is("person_id", null).is("deleted_at", null),
    supabase.from("knowledge_sources").select("id, title").eq("user_id", userId).eq("status", "Ready"),
  ]);
  return { courses: courses ?? [], deadlines: deadlines ?? [], tasks: tasks ?? [], knowledgeSources: knowledgeSources ?? [] };
}

/**
 * The anchor the conversational core needs so relative date/time phrases
 * ("tomorrow at 5pm") resolve against the user's actual timezone rather
 * than the model's own guess. Falls back to "UTC" (matches
 * DEFAULT_USER_PREFERENCES.timezone) when the user has never saved a
 * preferences row.
 */
export async function loadUserTimezone(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle();
  return data?.timezone ?? "UTC";
}

/**
 * mutationSchema's superRefine above guarantees every field this function
 * asserts non-null on (`!`) is actually present for the given operation —
 * these are no longer bare compile-time-only assertions papering over a
 * runtime gap; a schema-violating response never reaches this function.
 */
export function toPendingMutation(raw: RawMutation): PendingMutation {
  switch (raw.target_type) {
    case "course":
      return { targetType: "course", operation: "delete", targetId: raw.target_id };
    case "deadline": {
      if (raw.operation === "create") {
        return {
          targetType: "deadline",
          operation: "create",
          payload: { course_id: raw.course_id!, title: raw.title!, due_at: raw.due_at!, priority: raw.priority ?? undefined },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "deadline", operation: "delete", targetId: raw.target_id! };
      }
      return {
        targetType: "deadline",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.title ? { title: raw.title } : {}),
          ...(raw.due_at ? { due_at: raw.due_at } : {}),
          ...(raw.priority ? { priority: raw.priority } : {}),
        },
      };
    }
    case "task": {
      if (raw.operation === "create") {
        return {
          targetType: "task",
          operation: "create",
          payload: {
            title: raw.title!,
            due_at: raw.due_at,
            ...(raw.reminder_lead_minutes !== null ? { reminder_lead_minutes: raw.reminder_lead_minutes } : {}),
            priority: raw.priority ?? undefined,
          },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "task", operation: "delete", targetId: raw.target_id! };
      }
      return {
        targetType: "task",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.title ? { title: raw.title } : {}),
          ...(raw.due_at !== null ? { due_at: raw.due_at } : {}),
          ...(raw.reminder_lead_minutes !== null ? { reminder_lead_minutes: raw.reminder_lead_minutes } : {}),
          ...(raw.priority ? { priority: raw.priority } : {}),
        },
      };
    }
    case "note": {
      if (raw.operation === "create") {
        return { targetType: "note", operation: "create", payload: { body: raw.body! } };
      }
      if (raw.operation === "delete") {
        return { targetType: "note", operation: "delete", targetId: raw.target_id! };
      }
      return { targetType: "note", operation: "update", targetId: raw.target_id!, payload: { ...(raw.body ? { body: raw.body } : {}) } };
    }
    case "reminder":
      return {
        targetType: "reminder",
        operation: "acknowledge",
        targetId: raw.target_id,
        event: raw.event,
        snoozeUntil: raw.snooze_until ?? undefined,
      };
  }
}
