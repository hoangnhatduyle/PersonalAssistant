import { CONVERSATION_TOOLS } from "@/lib/voice/tools";

/**
 * The tool list handed to the Realtime model for a voice call.
 *
 * Derived from the same CONVERSATION_TOOLS the press-to-talk loop uses, so a
 * change to a tool's schema or description reaches both paths, minus what a
 * live call can't use and plus the three call-only tools.
 */

/** Realtime function tools are plain JSON-schema functions: no `strict` structured-output flag. */
export interface RealtimeToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Not offered on a call:
 *   respond_to_user                  -- the model speaks natively; there is no final-message tool.
 *   start_new_conversation           -- ending the call is the equivalent.
 *   get_personalization_suggestions  -- it kicks off a separate review-aloud flow with its own
 *                                       recorder and TTS, which would fight the call for the mic.
 */
export const EXCLUDED_FROM_CALL = ["respond_to_user", "start_new_conversation", "get_personalization_suggestions"] as const;

/** Tools that exist only on a call. */
export const CALL_ONLY_TOOLS = ["confirm_pending_mutation", "decline_pending_mutation", "end_call"] as const;
export type CallOnlyToolName = (typeof CALL_ONLY_TOOLS)[number];

/**
 * The shipped descriptions say to "call respond_to_user" in a few places. On a
 * call that tool doesn't exist, so the phrase is rewritten to what it means
 * here: say it aloud. Longest phrases first.
 */
export function adaptDescriptionForCall(description: string): string {
  return description
    .replace(/\bcall respond_to_user\b/g, "answer aloud")
    .replace(/\bvia respond_to_user\b/g, "aloud")
    .replace(/\brespond_to_user\b/g, "your spoken answer");
}

/**
 * The same rewrite applied to every `description` inside a parameter schema
 * (propose_mutation's field notes also say "explain that via respond_to_user",
 * including inside additional_steps). Structure is unchanged -- only description
 * strings -- so both paths still validate identically. Returns a copy.
 */
export function adaptSchemaForCall<T>(schema: T): T {
  if (Array.isArray(schema)) return schema.map((item) => adaptSchemaForCall(item)) as T;
  if (typeof schema !== "object" || schema === null) return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, key === "description" && typeof value === "string" ? adaptDescriptionForCall(value) : adaptSchemaForCall(value)]),
  ) as T;
}

const SESSION_ID_PARAMETERS = {
  type: "object",
  properties: {
    session_id: {
      type: "string",
      description: "The session_id returned by the propose_mutation result this refers to. Copy it exactly.",
    },
  },
  required: ["session_id"],
  additionalProperties: false,
};

const CALL_ONLY_DEFINITIONS: RealtimeToolDefinition[] = [
  {
    type: "function",
    name: "confirm_pending_mutation",
    description:
      "Carry out the change the user just agreed to. Call this ONLY after propose_mutation returned status \"awaiting_confirmation\" AND the user has clearly said yes in their own words (\"yes\", \"go ahead\", \"do it\", \"confirm\"). Never call it because it seems like what they want, never in the same turn as propose_mutation, and never for a maybe or a question. Pass that propose_mutation result's session_id. The result says whether it was executed -- only then tell the user it is done. If the result says needs_tap, tell them to tap Confirm on the screen.",
    parameters: SESSION_ID_PARAMETERS,
  },
  {
    type: "function",
    name: "decline_pending_mutation",
    description:
      "Cancel the change the user just declined. Call this after propose_mutation returned status \"awaiting_confirmation\" and the user clearly said no, cancel, never mind, or stop to your read-back of that change. A no that merely answers a clarifying question (for example \"does it repeat?\") is not a decline. Pass that propose_mutation result's session_id.",
    parameters: SESSION_ID_PARAMETERS,
  },
  {
    type: "function",
    name: "end_call",
    description:
      "Hang up. Call this when the user says goodbye, thanks you and signs off, or asks to end the call -- after a brief spoken farewell. Not for a pause in conversation.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

export function buildRealtimeTools(): RealtimeToolDefinition[] {
  const excluded = new Set<string>(EXCLUDED_FROM_CALL);
  const shared = CONVERSATION_TOOLS.filter((tool) => !excluded.has(tool.name)).map(
    (tool): RealtimeToolDefinition => ({
      type: "function",
      name: tool.name,
      description: adaptDescriptionForCall(tool.description),
      parameters: adaptSchemaForCall(tool.parameters) as Record<string, unknown>,
    }),
  );
  return [...shared, ...CALL_ONLY_DEFINITIONS];
}

/** Tool calls that end a turn by proposing or drafting a change; they must never share a response with another call. */
export const FINALIZING_CALL_TOOLS = ["propose_mutation", "save_mutation_draft"] as const;
