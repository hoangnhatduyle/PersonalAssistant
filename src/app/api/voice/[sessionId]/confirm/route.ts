import { requireAuthenticatedContext } from "@/lib/api/auth";
import {
  confirmVoiceSession,
  VoiceSessionExpiredError,
  VoiceSessionInvalidStateError,
  VoiceSessionNotFoundError,
} from "@/lib/voice/session";
import { successResponse, notFoundResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * POST /api/voice/[sessionId]/confirm — SPEC-API-005 AC-6/AC-9,
 * NC-API-003/SPEC-VOICE-005 NC-VOICE-005: executes exactly the persisted
 * pending_mutation, only while AwaitingConfirmation and only before
 * expires_at. The response's `result` discloses cascade scope for a
 * Course-delete mutation (AC-10, Tracked debt).
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { sessionId } = await params;

  try {
    const { executed, result } = await confirmVoiceSession(supabase, user.id, sessionId);
    return successResponse({
      session_id: sessionId,
      executed,
      result: { summary: result.summary, data: result.data, cascade: result.cascade ?? null },
    });
  } catch (error) {
    if (error instanceof VoiceSessionNotFoundError) return notFoundResponse();
    if (error instanceof VoiceSessionExpiredError) return validationErrorResponse("Confirmation window has expired");
    if (error instanceof VoiceSessionInvalidStateError) return validationErrorResponse(error.message);
    return serverErrorResponse("voice confirm failed", error);
  }
}
