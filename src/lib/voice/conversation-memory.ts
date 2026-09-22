import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { RawMutation } from "@/lib/voice/intent";
import type { PendingMutation } from "@/lib/voice/mutations";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export const CONVERSATION_IDLE_TIMEOUT_MINUTES = 30;
export const CONVERSATION_HISTORY_TURN_LIMIT = 8;

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

async function insertConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date,
): Promise<{ conversationId: string; isNew: true } | null> {
  const { data, error } = await supabase
    .from("voice_conversations")
    .insert({ user_id: userId, started_at: now.toISOString(), last_active_at: now.toISOString() })
    .select("id")
    .single();
  if (error) {
    // Lost a race against a concurrent turn for the same user inserting its
    // own fresh conversation at the same moment — the partial unique index
    // (at most one ended_at is null row per user) caught it, not an error.
    // Signal the caller to re-read the winner's row instead of surfacing a
    // 500 for what is, from the user's perspective, a normal outcome.
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return null;
    throw error;
  }
  return { conversationId: data.id, isNew: true };
}

/**
 * Resolves the user's single active (ended_at is null) conversation,
 * closing and replacing it first if it's gone stale past the idle timeout.
 * Conversations are scoped per user account and shared across devices, so
 * this is the one place a turn learns which conversation_id to file itself
 * under.
 */
export async function resolveActiveConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<{ conversationId: string; isNew: boolean }> {
  const { data: active, error: selectError } = await supabase
    .from("voice_conversations")
    .select("id, last_active_at")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (selectError) throw selectError;

  if (active) {
    const idleMs = now.getTime() - new Date(active.last_active_at).getTime();
    if (idleMs < CONVERSATION_IDLE_TIMEOUT_MINUTES * 60_000) {
      const { error: touchError } = await supabase
        .from("voice_conversations")
        .update({ last_active_at: now.toISOString() })
        .eq("id", active.id)
        .eq("user_id", userId);
      if (touchError) throw touchError;
      return { conversationId: active.id, isNew: false };
    }
    // Stale — close it before replacing. Best-effort: if this loses a race
    // to another concurrent turn already closing/replacing it, the insert
    // below (or its own race-retry path) is what actually matters.
    await endConversation(supabase, userId, active.id, "timeout").catch(() => {});
  }

  const inserted = await insertConversation(supabase, userId, now);
  if (inserted) return inserted;

  // Race lost — re-read the winner's row rather than retrying the insert.
  const { data: winner, error: winnerError } = await supabase
    .from("voice_conversations")
    .select("id")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (winnerError) throw winnerError;
  if (!winner) throw new Error(`resolveActiveConversation: lost an insert race for user ${userId} but found no winner row`);
  return { conversationId: winner.id, isNew: true };
}

/**
 * Closes a conversation — the single funnel both the natural-language
 * start_new_conversation tool and the UI reset button end up calling.
 * Guarded by `ended_at is null` so a second close (e.g. a lost race) is a
 * harmless no-op rather than clobbering the first close's end_reason.
 */
export async function endConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
  reason: "explicit" | "timeout",
): Promise<void> {
  const { error } = await supabase
    .from("voice_conversations")
    .update({ ended_at: new Date().toISOString(), end_reason: reason })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .is("ended_at", null);
  if (error) throw error;
}

/**
 * The last `limit` turns of a conversation, oldest-first, each row expanded
 * into a user turn + an assistant turn. Filtering response_message is not
 * null excludes turns that never reached a spoken response (clarification-only
 * exits, still-pending mutations) from polluting history.
 */
export async function loadConversationHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
  limit: number = CONVERSATION_HISTORY_TURN_LIMIT,
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from("voice_sessions")
    .select("transcript, response_message")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .not("response_message", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const turns: ConversationTurn[] = [];
  for (const row of [...(data ?? [])].reverse()) {
    if (row.transcript) turns.push({ role: "user", content: row.transcript });
    // Guaranteed non-null by the `.not("response_message", "is", null)`
    // filter above — Postgrest's own types can't encode that, hence the `!`.
    turns.push({ role: "assistant", content: row.response_message! });
  }
  return turns;
}

/** What's actually persisted for an in-progress mutation: the fields resolved so far, plus the question last asked about what's still missing. */
export interface DraftMutationRecord {
  mutation: RawMutation;
  question: string;
}

/**
 * The in-progress, not-yet-complete mutation (if any) the conversational
 * core last asked a clarifying question about via save_mutation_draft —
 * conversation-core.ts injects this into the next turn's system prompt so a
 * follow-up answer ("3pm for 30 minutes") isn't evaluated from a blank
 * slate. Null once cleared (setDraftMutation below) or once the
 * conversation itself has moved on/expired.
 */
export async function loadDraftMutation(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
): Promise<DraftMutationRecord | null> {
  const { data, error } = await supabase
    .from("voice_conversations")
    .select("draft_mutation")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.draft_mutation as DraftMutationRecord | null) ?? null;
}

/**
 * Sets (save_mutation_draft fired) or clears (any other turn outcome — a
 * plain answer or a completed propose_mutation) the conversation's draft. A
 * draft is single-shot: either the very next relevant turn completes it, or
 * anything else — an unrelated question, a different mutation, an explicit
 * reset — supersedes and discards it, same as the caller passing `null`
 * here does. No tamper-lockdown trigger guards this column (unlike
 * voice_sessions.pending_mutation) — see 0037_voice_conversation_draft_mutation.sql
 * for why that's a deliberate, not missing, decision.
 */
export async function setDraftMutation(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
  draft: DraftMutationRecord | null,
): Promise<void> {
  const { error } = await supabase
    .from("voice_conversations")
    .update({ draft_mutation: draft as unknown as Json })
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** One already-confirmed-pending step of the general multi-step command queue (conversation-core.ts's QueuedMutationStep) -- a complete, ready-to-propose mutation plus the summary to speak for its own confirmation prompt. */
export interface QueuedStep {
  mutation: PendingMutation;
  summary: string;
}

/**
 * The remaining steps (if any) of the multi-step command queue a
 * propose_mutation call resolved up front (additional_steps, tools.ts) --
 * conversation-scoped cross-turn state, the exact same shape/lifecycle as
 * draft_mutation above (see 0046_voice_conversation_queued_steps.sql for why
 * it needs no tamper-lockdown trigger either: a queued step is never
 * executed directly, it only ever seeds a fresh AwaitingConfirmation row
 * that still has to go through the normal confirm/decline dance).
 * session.ts's confirmVoiceSession pops the head off this list on every
 * confirm and mints the next AwaitingConfirmation session from it; decline/
 * expire clear the whole list instead of advancing it.
 */
export async function loadQueuedSteps(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
): Promise<QueuedStep[]> {
  const { data, error } = await supabase
    .from("voice_conversations")
    .select("queued_steps")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.queued_steps as QueuedStep[] | null) ?? [];
}

/** Sets (a propose_mutation call resolved additional_steps) or clears (queue exhausted, or a decline/expiry aborted it) the conversation's queued steps. */
export async function setQueuedSteps(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
  steps: QueuedStep[] | null,
): Promise<void> {
  const { error } = await supabase
    .from("voice_conversations")
    .update({ queued_steps: steps as unknown as Json })
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}
