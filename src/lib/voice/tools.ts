import type OpenAI from "openai";
import type { ScheduleTimeWindow } from "@/lib/voice/schedule-time-window";

const SCHEDULE_WINDOWS: readonly ScheduleTimeWindow[] = ["today", "tomorrow", "week", "unscoped"];

export interface GetScheduleArgs {
  window: ScheduleTimeWindow;
}

export interface LookupKnowledgeArgs {
  query: string;
}

export interface RespondToUserArgs {
  message: string;
  needs_follow_up: boolean;
}

/**
 * Mirrors intent.ts's mutationSchema field set (flattened across every
 * target_type variant, each nullable) plus confidence/summary. Deliberately
 * flat rather than a JSON-schema anyOf/oneOf mirroring mutationSchema's zod
 * discriminatedUnion: mutationSchema's branches are plain (non-strict) zod
 * objects that silently drop unrecognized keys, so this flat shape can be
 * handed to `mutationSchema.parse(...)` unmodified in conversation-core.ts —
 * zod picks the right branch by target_type and ignores the fields that
 * belong to other branches — getting full reuse of the existing validation
 * with no new logic and no dependency on nested-schema support in strict
 * tool-calling mode.
 */
export interface ProposeMutationArgs {
  confidence: number;
  summary: string;
  target_type: "course" | "deadline" | "task" | "note" | "reminder";
  operation: "create" | "update" | "delete" | "acknowledge";
  target_id: string | null;
  course_id: string | null;
  title: string | null;
  due_at: string | null;
  body: string | null;
  priority: "Low" | "Medium" | "High" | "Urgent" | null;
  reminder_lead_minutes: number | null;
  event: "user_acknowledges" | "user_dismisses" | "user_snoozes" | null;
  snooze_until: string | null;
}

/** get_personalization_suggestions and start_new_conversation both take no arguments. */
export type EmptyToolArgs = Record<string, never>;

/**
 * OpenAI tool-calling schemas for the conversational core (src/lib/voice/
 * conversation-core.ts). This file only owns the schema/name surface --
 * each handler's actual implementation lives where the dispatch switch (2e)
 * reuses an existing function:
 *   get_schedule                     -> loadSchedule (schedule-loader.ts)
 *   lookup_knowledge                 -> runKnowledgeLookup (knowledge/retrieval.ts)
 *   get_personalization_suggestions  -> runSuggestionsLookup (suggestions-lookup.ts)
 *   start_new_conversation           -> endConversation + resolveActiveConversation (conversation-memory.ts)
 *   respond_to_user                  -> handled directly in conversation-core's loop, not dispatchTool
 *   propose_mutation                 -> handled directly in conversation-core's loop, not dispatchTool
 *
 * `strict: true` on every entry gets constrained decoding on arguments
 * (every property required, additionalProperties false) -- this refactor's
 * whole premise depends on tool-call arguments actually parsing, so it's
 * worth the guarantee over the small loss of schema flexibility.
 *
 * `as const satisfies` (rather than a plain `OpenAI.ChatCompletionTool[]`
 * annotation) keeps each `function.name` literal-typed, so ToolName below
 * is derived from this array instead of duplicated as a separate list --
 * the two can never drift out of lockstep.
 */
export const CONVERSATION_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_schedule",
      description:
        'Look up the user\'s Deadlines, Tasks, and open Course To-Do / custom-project items due within a time window. Returns structured data already grouped by day and sorted by priority -- narrate it yourself in prose, never invent your own ordering, and never re-rank it. Today\'s schedule (window: "today") is already provided to you in the system prompt -- only call this tool for "tomorrow", "week", or "unscoped".',
      strict: true,
      parameters: {
        type: "object",
        properties: {
          window: {
            type: "string",
            enum: SCHEDULE_WINDOWS,
            description:
              '"today", "tomorrow", "week" (the next 7 days including today), or "unscoped" (no date filter -- the next few upcoming items of each kind).',
          },
        },
        required: ["window"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_knowledge",
      description:
        "Search the user's personal knowledge base (saved notes, links, imported documents) for an answer. This tool has no memory of the conversation, so restate the user's question as a focused, self-contained search query using context from the conversation so far.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A focused, self-contained search query, in the user's own terms." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_personalization_suggestions",
      description: "Check for pending personalization suggestions (e.g. reminder-timing adjustments) generated from the user's recent feedback.",
      strict: true,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "start_new_conversation",
      description:
        "Silently end the current conversation and start a fresh one, discarding prior turns from memory. Call this only when the user explicitly asks to start over, forget what was said before, or begin a new conversation. Never announce that you did this -- just continue naturally with whatever else the user asked in the same turn.",
      strict: true,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_user",
      description:
        'Deliver your final spoken answer for this turn. Call this by itself, only after you\'ve already called any data tools you needed -- never in the same turn as another tool call. Set needs_follow_up to true only when `message` ends by asking the user a question or presenting a choice/decision that expects a reply next (e.g. "Want me to do X, or check Y instead?"). Set it to false for a complete answer or statement, even one that casually invites more questions ("let me know if you want more detail") without actually needing a reply to continue.',
      strict: true,
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The final response to speak back to the user." },
          needs_follow_up: {
            type: "boolean",
            description: "True only if this message asks a question or presents a choice that expects the user to reply next.",
          },
        },
        required: ["message", "needs_follow_up"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_mutation",
      description:
        "Propose a single explicit, unambiguous data change (create/update/delete a Deadline, Task, or Note; delete a Course; acknowledge/dismiss/snooze a Reminder) the user just instructed. Call this by itself, never alongside another tool call. Never invent an id -- target_id/course_id must come from the entity context provided to you. If you are not confident this is really a command (versus a question or hypothetical) or an id does not clearly match the context, set confidence below 0.95 rather than guessing -- do not silently answer via respond_to_user instead just because you are unsure, since that skips the confirmation step entirely.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          confidence: { type: "number", description: "0-1, your genuine confidence this is the right mutation to propose." },
          summary: { type: "string", description: "One sentence describing the action, to be spoken back to the user for confirmation." },
          target_type: { type: "string", enum: ["course", "deadline", "task", "note", "reminder"] },
          operation: { type: "string", enum: ["create", "update", "delete", "acknowledge"] },
          target_id: { type: ["string", "null"], description: "An id from the provided entity context. Null only for a create." },
          course_id: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          due_at: { type: ["string", "null"], description: "ISO 8601 datetime with a UTC offset." },
          body: { type: ["string", "null"] },
          priority: { type: ["string", "null"], enum: ["Low", "Medium", "High", "Urgent", null] },
          reminder_lead_minutes: { type: ["integer", "null"] },
          event: { type: ["string", "null"], enum: ["user_acknowledges", "user_dismisses", "user_snoozes", null] },
          snooze_until: { type: ["string", "null"] },
        },
        required: [
          "confidence",
          "summary",
          "target_type",
          "operation",
          "target_id",
          "course_id",
          "title",
          "due_at",
          "body",
          "priority",
          "reminder_lead_minutes",
          "event",
          "snooze_until",
        ],
        additionalProperties: false,
      },
    },
  },
] as const satisfies OpenAI.ChatCompletionTool[];

export type ToolName = (typeof CONVERSATION_TOOLS)[number]["function"]["name"];
