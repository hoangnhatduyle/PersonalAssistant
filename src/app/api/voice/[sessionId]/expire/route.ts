import { requireAuthenticatedContext } from "@/lib/api/auth";
import { expireVoiceSession, VoiceSessionNotFoundError } from "@/lib/voice/session";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * POST /api/voice/[sessionId]/expire — client-triggered version of the
 * confirmation_window_expired transition, called by ConfirmationBar once its
 * own countdown reaches zero with no confirm/decline. Best-effort by design:
 * a session that already moved on (confirmed, declined, or already expired)
 * is not an error here, unlike confirm/decline's own state checks.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { sessionId } = await params;

  try {
    const { expired } = await expireVoiceSession(supabase, user.id, sessionId);
    return successResponse({ session_id: sessionId, expired });
  } catch (error) {
    if (error instanceof VoiceSessionNotFoundError) return notFoundResponse();
    return serverErrorResponse("voice expire failed", error);
  }
}
