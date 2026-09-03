import { requireAuthenticatedContext } from "@/lib/api/auth";
import { endConversation, resolveActiveConversation } from "@/lib/voice/conversation-memory";
import { successResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * POST /api/voice/conversation/reset — the UI-button half of the dual reset
 * trigger (a natural-language start_new_conversation tool is the other
 * half); both funnel through endConversation(..., "explicit"). Deliberately
 * does not create a new conversation itself — the next real turn does that
 * naturally via resolveActiveConversation finding none active. Silent per
 * the user's decision: no message to speak/toast, just {ok: true}.
 */
export async function POST() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const { conversationId } = await resolveActiveConversation(supabase, user.id);
    await endConversation(supabase, user.id, conversationId, "explicit");
    return successResponse({ ok: true });
  } catch (error) {
    return serverErrorResponse("voice conversation reset failed", error);
  }
}
