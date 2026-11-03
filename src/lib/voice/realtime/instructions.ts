import type { DraftMutationRecord } from "@/lib/voice/conversation-memory";
import { buildTurnContext, CONVERSATION_SYSTEM_PROMPT } from "@/lib/voice/conversation-core";
import type { EntityContext } from "@/lib/voice/intent";
import type { ScheduleToolPayload } from "@/lib/voice/schedule-loader";

/**
 * Instructions for a Realtime voice call: the shipped assistant prompt,
 * verbatim, behind a short block that adapts it to a live spoken call, then the
 * same per-turn context a press-to-talk turn gets (clock, calendar, today's
 * schedule, the user's entities, any open draft).
 *
 * The shipped prompt is kept byte-for-byte rather than rewritten for two
 * reasons: its domain rules (how to resolve dates, transitions, recurrence,
 * multi-step commands) were tuned against the live eval and should not fork,
 * and it mentions respond_to_user throughout its examples, so a text rewrite
 * would be fragile. The cost is that the model must apply the overrides below
 * to those mentions -- which the Realtime eval driver measures.
 */

export interface ConversationHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export const REALTIME_ADAPTATION = `LIVE VOICE CALL -- READ THIS BEFORE THE REST. Everything after this block was written for a text pipeline. You are now in a live spoken call with the user, who can hear you and can interrupt you at any time. Where the rules below conflict with this block, this block wins.

- Speak your answers directly. There is NO respond_to_user tool and no needs_follow_up flag in this call. Wherever the rules below say to call respond_to_user, say that message aloud instead. Never narrate a tool call, and never read an id aloud.
- You do not have get_personalization_suggestions or start_new_conversation on this call. If asked for either, say you can't do that during a call and the regular assistant can.
- Be conversational: short spoken sentences, usually under about 40 words a turn. If the user interrupts, stop and listen.
- Before calling a slow tool (lookup_knowledge or triage_email), say a very short filler such as "One sec, let me check." and then call it.
- Changes: when propose_mutation returns status "awaiting_confirmation", read its summary aloud and ask for a yes or no. Only after the user clearly says yes in their own words, call confirm_pending_mutation with that session_id; after a clear no, call decline_pending_mutation. Never confirm on your own initiative, never in the same turn as the proposal, and never say a change is done until the confirm result says it was executed. If a result says needs_tap, tell the user to tap Confirm on the screen. If a propose_mutation result asks you to have the user rephrase, ask them to.
- Confirm and decline only apply to the yes-or-no you asked after reading back a proposal. A yes or no to any other question is just an answer: if you asked a clarifying question first (does it repeat? which course? what time?), "No, just once" or "yes, weekly" is the detail you needed, so use it and call propose_mutation. Never call confirm_pending_mutation or decline_pending_mutation when no propose_mutation result is awaiting confirmation.
- People: only look up someone's schedule when the user actually named them or described them by relationship. If they name a person who is not in the "people" list, say you don't have anyone tracked by that name -- even when the list holds only one person, never substitute that person.
- When the user says goodbye or asks to hang up, say a brief goodbye and call end_call.
- This call has a time limit; if you are told it is about to end, wrap up in one sentence.`;

const MAX_HISTORY_TURNS = 8;

function describeHistory(history: readonly ConversationHistoryTurn[]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  if (recent.length === 0) return "";
  const lines = recent.map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`);
  return `\n\nThe conversation so far, before this call began -- earlier typed or push-to-talk turns with the same user. Use it to resolve pronouns and follow-ups, as the instructions above describe; it is history, not new requests:\n${lines.join("\n")}`;
}

export interface RealtimeInstructionsInput {
  now: Date;
  timezone: string;
  context: EntityContext;
  todaySchedule: ScheduleToolPayload;
  draft: DraftMutationRecord | null;
  history: readonly ConversationHistoryTurn[];
}

export function buildRealtimeInstructions(input: RealtimeInstructionsInput): string {
  return [
    REALTIME_ADAPTATION,
    CONVERSATION_SYSTEM_PROMPT,
    buildTurnContext(input.now, input.timezone, input.context, input.todaySchedule, input.draft) + describeHistory(input.history),
  ].join("\n\n");
}
