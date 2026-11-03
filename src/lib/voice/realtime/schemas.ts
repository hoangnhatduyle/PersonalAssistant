import { z } from "zod";

/** Why a call ended; mirrors the check constraint in 0058_voice_realtime_calls.sql (minus 'superseded', which only the server sets). */
export const CALL_END_REASONS = ["user", "cap", "idle", "hidden", "error"] as const;

/** Body of POST /api/voice/realtime/tool. */
export const toolRequestSchema = z.object({
  callId: z.uuid(),
  name: z.string().min(1).max(64),
  /** The model's raw JSON-string arguments; parsed and validated per tool by the executor. */
  arguments: z.string().max(50_000),
  lastUserTranscript: z.string().max(4000).nullable(),
  /** Names of every function call in the same model response. */
  batch: z.array(z.string().min(1).max(64)).min(1).max(8),
});

/** Body of POST /api/voice/realtime/[callId]/end. Optional: sendBeacon on page hide may send nothing useful. */
export const endRequestSchema = z.object({
  reason: z.enum(CALL_END_REASONS).default("user"),
});

export type ToolRequest = z.infer<typeof toolRequestSchema>;
