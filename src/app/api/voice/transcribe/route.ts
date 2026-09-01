import { requireAuthenticatedContext } from "@/lib/api/auth";
import { transcribeAudio } from "@/lib/voice/deepgram";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

export interface VoiceTranscribeResponse {
  transcript: string;
}

/**
 * POST /api/voice/transcribe — transcription only, no intent resolution.
 * Used for short utterances (a spoken yes/no confirmation, a suggestion
 * apply/skip answer) that must never be run through the full LLM intent
 * pipeline in src/lib/voice/session.ts — "yes" fed to resolveIntent() would
 * just confuse it. Mirrors POST /api/voice's audio-body handling exactly,
 * minus the voice_sessions/intent machinery. Not rate-limited, matching
 * /api/voice itself.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) return validationErrorResponse("Expected an audio/* body");

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length === 0) return validationErrorResponse("Audio body is empty");

  try {
    const transcript = await transcribeAudio(buffer, contentType);
    return successResponse<VoiceTranscribeResponse>({ transcript });
  } catch (error) {
    return serverErrorResponse("voice transcribe failed", error);
  }
}
