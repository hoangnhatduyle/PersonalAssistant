import { requireAuthenticatedContext } from "@/lib/api/auth";
import { serverErrorResponse, successResponse } from "@/lib/api/response";
import { buildCallInstructions } from "@/lib/voice/realtime/session-state";

/**
 * GET /api/voice/realtime/context -- fresh instructions for a call already in
 * progress. A confirmed change alters ids and statuses the model was given at
 * the start, so the client sends these back as a `session.update`; otherwise
 * the model keeps proposing against a stale snapshot (and the legality gate
 * keeps asking questions about moves that are no longer valid).
 */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const { instructions } = await buildCallInstructions(supabase, user.id);
    return successResponse({ instructions });
  } catch (error) {
    return serverErrorResponse("realtime context refresh failed", error);
  }
}
