import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import { requireEnv } from "@/lib/env";
import type { PendingMutation } from "@/lib/voice/mutations";

export interface ResolvedIntent {
  confidence: number;
  readOnly: boolean;
  /** Short human-readable description of the resolved action, spoken/shown back to the user. */
  summary: string;
  queryKind?: "upcoming_schedule";
  mutation?: PendingMutation;
}

export interface ResolveIntentFn {
  (supabase: SupabaseClient<Database>, userId: string, transcript: string): Promise<ResolvedIntent>;
}

const mutationSchemaBase = z.discriminatedUnion("target_type", [
  z.object({ target_type: z.literal("course"), operation: z.literal("delete"), target_id: z.uuid() }),
  z.object({
    target_type: z.literal("deadline"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    course_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    priority: z.string().nullable(),
  }),
  z.object({
    target_type: z.literal("task"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
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

// Review finding: a schema-violating LLM response of { read_only: false,
// mutation: null } (or the reverse) previously passed validation, then
// crashed session.ts's unguarded `intent.mutation as PendingMutation` cast.
export const llmResponseSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    read_only: z.boolean(),
    summary: z.string(),
    query_kind: z.literal("upcoming_schedule").nullable(),
    mutation: mutationSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.read_only && value.mutation !== null) {
      ctx.addIssue({ code: "custom", message: "mutation must be null when read_only is true", path: ["mutation"] });
    }
    if (!value.read_only && value.mutation === null) {
      ctx.addIssue({ code: "custom", message: "mutation is required when read_only is false", path: ["mutation"] });
    }
  });

const SYSTEM_PROMPT = `You are the intent-resolution layer for a student personal-assistant app.
Given a spoken/transcribed user request and a JSON list of that user's current
Courses, Deadlines, and Tasks (with their ids), resolve it to exactly one
supported operation and respond with ONLY a JSON object matching this shape:

{
  "confidence": number,        // 0-1, your genuine confidence this is the right resolution
  "read_only": boolean,
  "summary": string,           // one sentence describing the action, for the user
  "query_kind": "upcoming_schedule" | null,   // set when read_only and the user asked what's due/upcoming
  "mutation": {                // set when !read_only, else null
    "target_type": "course" | "deadline" | "task" | "note" | "reminder",
    "operation": "create" | "update" | "delete" | "acknowledge",
    "target_id": string | null,   // an id from the provided context list; null only for "create"
    ... other fields for the target type (title, due_at, body, event, etc.), null if not mentioned
  } | null
}

Supported operations: create/update/delete a Deadline, Task, or Note;
delete a Course; acknowledge/dismiss/snooze a Reminder; query the upcoming
schedule (read-only). Nothing else is supported.

If the request doesn't map confidently to one of these, or names an entity
not in the provided context list, set confidence below 0.95 rather than
guessing at a target_id. Never invent an id.`;

interface EntityContext {
  courses: Array<{ id: string; name: string }>;
  deadlines: Array<{ id: string; title: string; course_id: string }>;
  tasks: Array<{ id: string; title: string }>;
}

async function loadEntityContext(supabase: SupabaseClient<Database>, userId: string): Promise<EntityContext> {
  const [{ data: courses }, { data: deadlines }, { data: tasks }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("user_id", userId).is("deleted_at", null),
    supabase.from("deadlines").select("id, title, course_id").eq("user_id", userId).is("deleted_at", null),
    supabase.from("tasks").select("id, title").eq("user_id", userId).is("deleted_at", null),
  ]);
  return { courses: courses ?? [], deadlines: deadlines ?? [], tasks: tasks ?? [] };
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
        return { targetType: "task", operation: "create", payload: { title: raw.title!, due_at: raw.due_at } };
      }
      if (raw.operation === "delete") {
        return { targetType: "task", operation: "delete", targetId: raw.target_id! };
      }
      return {
        targetType: "task",
        operation: "update",
        targetId: raw.target_id!,
        payload: { ...(raw.title ? { title: raw.title } : {}), ...(raw.due_at !== null ? { due_at: raw.due_at } : {}) },
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

/**
 * Resolves a transcript to a ResolvedIntent using an LLM classifier
 * (SPEC-VOICE-005's "LLM for intent parsing/NLU", vendor decision open).
 * Entity ids are only ever id's the caller's own live rows already had — the
 * model is given a context list and told never to invent one; toPendingMutation
 * simply forwards whatever the model chose, so a hallucinated id fails at
 * execution time (not-found/RLS) rather than silently targeting a real row.
 */
export async function resolveIntent(
  supabase: SupabaseClient<Database>,
  userId: string,
  transcript: string,
): Promise<ResolvedIntent> {
  const context = await loadEntityContext(supabase, userId);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ transcript, context }) },
    ],
  });

  const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}");
  const parsed = llmResponseSchema.parse(raw);

  return {
    confidence: parsed.confidence,
    readOnly: parsed.read_only,
    summary: parsed.summary,
    queryKind: parsed.query_kind ?? undefined,
    mutation: parsed.mutation ? toPendingMutation(parsed.mutation) : undefined,
  };
}
