import type OpenAI from "openai";
import type { ScheduleTimeWindow } from "@/lib/voice/schedule-time-window";

const SCHEDULE_WINDOWS: readonly ScheduleTimeWindow[] = ["today", "tomorrow", "week", "unscoped"];

export interface GetScheduleArgs {
  window: ScheduleTimeWindow;
}

export interface LookupKnowledgeArgs {
  query: string;
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
        "Look up the user's Deadlines, Tasks, and open Course To-Do / custom-project items due within a time window. Returns structured data already grouped by day and sorted by priority -- narrate it yourself in prose, never invent your own ordering, and never re-rank it.",
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
] as const satisfies OpenAI.ChatCompletionTool[];

export type ToolName = (typeof CONVERSATION_TOOLS)[number]["function"]["name"];
