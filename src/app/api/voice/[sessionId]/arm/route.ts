import { requireAuthenticatedContext } from "@/lib/api/auth";
import { armVoiceConfirmation, VoiceSessionNotFoundError } from "@/lib/voice/session";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * POST /api/voice/[sessionId]/arm — starts the real confirmation window,
 * called by ConfirmationBar once the spoken prompt has finished (or right
 * away for a text-mode turn). Best-effort by design: a session that already
 * moved on or lapsed is { armed: false }, not an error, and calling it more
 * than once can never extend the window.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { user } = ctx;
  const { sessionId } = await params;

  try {
    const { armed } = await armVoiceConfirmation(createServiceRoleClient(), user.id, sessionId);
    return successResponse({ session_id: sessionId, armed });
  } catch (error) {
    if (error instanceof VoiceSessionNotFoundError) return notFoundResponse();
    return serverErrorResponse("voice arm failed", error);
  }
}
