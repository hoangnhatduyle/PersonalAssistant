import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadConversationHistory, loadDraftMutation, resolveActiveConversation } from "@/lib/voice/conversation-memory";
import { loadEntityContext, loadUserTimezone } from "@/lib/voice/intent";
import { loadSchedule, toScheduleToolPayload } from "@/lib/voice/schedule-loader";
import { buildRealtimeInstructions } from "@/lib/voice/realtime/instructions";
import { buildToneBlock, resolveVoicePersona } from "@/lib/voice/realtime/personas";

/**
 * Everything a call's instructions are built from, loaded the same way a
 * press-to-talk turn loads it (entity context, today's schedule, timezone,
 * open draft, recent history). Used at call start, and again when a confirmed
 * change makes the model's snapshot of the user's data stale.
 */
export async function buildCallInstructions(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
  /** A specific conversation to build for. Defaults to the user's active one; the eval passes its own so concurrent cases stay isolated. */
  conversationId?: string,
): Promise<{ instructions: string; timezone: string; voice: string; speed: number }> {
  const conversation = { conversationId: conversationId ?? (await resolveActiveConversation(supabase, userId, now)).conversationId };
  const [timezone, persona, context, todaySchedule, draft, history] = await Promise.all([
    loadUserTimezone(supabase, userId),
    loadVoicePersona(supabase, userId),
    loadEntityContext(supabase, userId),
    loadSchedule(supabase, userId, "today", now),
    loadDraftMutation(supabase, userId, conversation.conversationId),
    loadConversationHistory(supabase, userId, conversation.conversationId),
  ]);
  return {
    timezone,
    // The voice cannot change once a call is under way, but the tone rides in the instructions, which a mid-call refresh rebuilds -- so it must be included here, not only at call start.
    voice: persona.voice,
    speed: persona.speed,
    instructions: buildRealtimeInstructions({
      now,
      timezone,
      context,
      todaySchedule: toScheduleToolPayload(todaySchedule),
      draft,
      history,
      toneBlock: buildToneBlock(persona),
    }),
  };
}

async function loadVoicePersona(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase.from("user_preferences").select("voice_persona").eq("user_id", userId).maybeSingle();
  return resolveVoicePersona(data?.voice_persona);
}
