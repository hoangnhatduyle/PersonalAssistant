import { requireAuthenticatedContext } from "@/lib/api/auth";
import { voiceSpeakSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, rateLimitedResponse, serverErrorResponse } from "@/lib/api/response";
import { synthesizeSpeech, synthesizeSpeechStream } from "@/lib/voice/text-to-speech";
import { checkSpeakRateLimit } from "@/lib/voice/rate-limit";
import { timed } from "@/lib/voice/_perf-temp";

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

  const requestStart = Date.now(); // TEMPORARY perf diagnostic — see _perf-temp.ts
  try {
    const { allowed } = await timed("rate limit check", () => checkSpeakRateLimit(supabase, user.id));
    if (!allowed) return rateLimitedResponse();

    // Streaming path (NC-API-SPEAK-002 extension): only ever taken when the
    // client has already feature-detected MediaSource support for
    // audio/mpeg (src/lib/voice/play-audio.ts's isMediaSourceStreamingSupported)
    // -- this is the first raw, non-successResponse Response anywhere in
    // src/app/api, deliberately scoped to only this branch of this route.
    if (parsed.data.stream) {
      const stream = await timed("synthesizeSpeechStream (time to first chunk)", () => synthesizeSpeechStream(parsed.data.text));
      console.log(`[perf] /api/voice/speak (stream) total before response: ${Date.now() - requestStart}ms`);
      return new Response(stream, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    }

    const audio = await timed("synthesizeSpeech (buffered, full clip)", () => synthesizeSpeech(parsed.data.text));
    console.log(`[perf] /api/voice/speak (buffered) total: ${Date.now() - requestStart}ms`);
    return successResponse<VoiceSpeakResponse>({ audio: audio.toString("base64"), mimetype: "audio/mpeg" });
  } catch (error) {
    return serverErrorResponse("voice speak failed", error);
  }
}
