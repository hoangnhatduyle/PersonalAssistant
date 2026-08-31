import { requireAuthenticatedContext } from "@/lib/api/auth";
import { intakeVoiceTurn } from "@/lib/voice/session";
import { transcribeAudio } from "@/lib/voice/deepgram";
import { resolveIntent } from "@/lib/voice/intent";
import { runKnowledgeLookup } from "@/lib/knowledge/retrieval";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * POST /api/voice — SPEC-VOICE-005/SPEC-API-005 AC-3: intake one
 * press-to-talk turn. Accepts either a raw `audio/*` body (transcribed via
 * Deepgram) or `{ transcript: string }` JSON (text-mode intake, same
 * pipeline from intent resolution onward).
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const contentType = request.headers.get("content-type") ?? "";
  let input: { audio: Buffer; mimetype: string } | { transcript: string };
  if (contentType.startsWith("audio/")) {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length === 0) return validationErrorResponse("Audio body is empty");
    input = { audio: buffer, mimetype: contentType };
  } else {
    const body = await request.json().catch(() => null);
    const transcript = body && typeof body === "object" ? (body as { transcript?: unknown }).transcript : undefined;
    if (typeof transcript !== "string" || transcript.trim().length === 0) {
      return validationErrorResponse("Expected an audio/* body or a JSON { transcript: string } body");
    }
    input = { transcript };
  }

  try {
    const turn = await intakeVoiceTurn(supabase, user.id, input, {
      transcribe: transcribeAudio,
      resolveIntent,
      knowledgeLookup: runKnowledgeLookup,
    });
    return successResponse(turn, { status: 201 });
  } catch (error) {
    return serverErrorResponse("voice intake failed", error);
  }
}
