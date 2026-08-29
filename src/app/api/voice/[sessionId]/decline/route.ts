import { requireAuthenticatedContext } from "@/lib/api/auth";
import { declineVoiceSession, VoiceSessionInvalidStateError, VoiceSessionNotFoundError } from "@/lib/voice/session";
import { successResponse, notFoundResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/** POST /api/voice/[sessionId]/decline — SPEC-VOICE-005 AC-5: no mutation executes. */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { sessionId } = await params;

  try {
    const { message } = await declineVoiceSession(supabase, user.id, sessionId);
    return successResponse({ session_id: sessionId, executed: false, message });
  } catch (error) {
    if (error instanceof VoiceSessionNotFoundError) return notFoundResponse();
    if (error instanceof VoiceSessionInvalidStateError) return validationErrorResponse(error.message);
    return serverErrorResponse("voice decline failed", error);
  }
}
