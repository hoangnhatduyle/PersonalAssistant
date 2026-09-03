import { requireAuthenticatedContext } from "@/lib/api/auth";
import { voiceSpeakSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, rateLimitedResponse, serverErrorResponse } from "@/lib/api/response";
import { synthesizeSpeech } from "@/lib/voice/text-to-speech";
import { checkSpeakRateLimit } from "@/lib/voice/rate-limit";

export interface VoiceSpeakResponse {
  audio: string;
  mimetype: "audio/mpeg";
}

/**
 * POST /api/voice/speak — SPEC-API-010: synthesizes speech for a
 * microphone-originated assistant response. Narrowly scoped and purely
 * additive — does not touch POST /api/voice or its confirm/decline routes;
 * the client alone decides whether a given message warrants calling this
 * (see NC-API-SPEAK-007).
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = voiceSpeakSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const { allowed } = await checkSpeakRateLimit(supabase, user.id);
    if (!allowed) return rateLimitedResponse();

    const audio = await synthesizeSpeech(parsed.data.text);
    return successResponse<VoiceSpeakResponse>({ audio: audio.toString("base64"), mimetype: "audio/mpeg" });
  } catch (error) {
    return serverErrorResponse("voice speak failed", error);
  }
}
