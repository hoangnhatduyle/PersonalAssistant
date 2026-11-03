import type { RealtimeSessionCreateRequest } from "openai/resources/realtime/realtime";
import { REALTIME_DEFAULT_MODEL, REALTIME_DEFAULT_VOICE } from "@/lib/voice/realtime/constants";
import { buildRealtimeTools } from "@/lib/voice/realtime/tools";

/**
 * The Realtime session the server asks OpenAI to set up for a call. It is
 * baked into the ephemeral client secret, so the instructions (which embed the
 * user's data) and the tool list never pass through the browser as editable
 * input.
 */

export interface SessionConfigInput {
  instructions: string;
  model?: string;
  voice?: string;
}

/**
 * `reasoning` is only accepted by the reasoning-capable models. The SDK names
 * gpt-realtime-2 as one; a size or date suffix ("-mini", "-2025-08-28") is not
 * known to be, and sending the field to a model that rejects it would fail the
 * whole session start, so only a bare "gpt-realtime-<major>[.<minor>]" with a
 * major of 2 or more qualifies.
 */
export function supportsReasoning(model: string): boolean {
  return /^gpt-realtime-(?:[2-9]|[1-9]\d)(?:\.\d+)?$/.test(model);
}

export function resolveModel(env: Record<string, string | undefined> = process.env): string {
  return env.REALTIME_MODEL || REALTIME_DEFAULT_MODEL;
}

export function resolveVoice(env: Record<string, string | undefined> = process.env): string {
  return env.REALTIME_VOICE || REALTIME_DEFAULT_VOICE;
}

export function buildSessionConfig(input: SessionConfigInput): RealtimeSessionCreateRequest {
  const model = input.model ?? resolveModel();
  return {
    type: "realtime",
    model,
    instructions: input.instructions,
    output_modalities: ["audio"],
    tools: buildRealtimeTools(),
    tool_choice: "auto",
    // One call per response: a proposal must be alone anyway (the executor
    // enforces it too), and parallel calls only add ways to get it wrong.
    parallel_tool_calls: false,
    // A runaway guard, not a style limit -- spoken answers are kept short by the prompt.
    max_output_tokens: 2000,
    ...(supportsReasoning(model) ? { reasoning: { effort: "low" as const } } : {}),
    audio: {
      input: {
        // The phone's own noise suppression already runs in the browser; this
        // is for a handset on a dash mount rather than a close-talking mic.
        noise_reduction: { type: "far_field" },
        // The confirm gate reads the user's own words, so their transcript is not optional.
        transcription: { model: "gpt-4o-mini-transcribe" },
        // The model decides when the user has finished, and stops talking when
        // the user starts -- the interruption behaviour of a real conversation.
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
      },
      output: { voice: input.voice ?? resolveVoice() },
    },
  };
}
