import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { KnowledgeCitation } from "@/lib/knowledge/retrieval";
import {
  dispatchTool,
  parseProposeMutationArgs,
  parseSaveMutationDraftArgs,
  ToolArgsError,
  type ToolCallLike,
  type ToolDispatchResult,
} from "@/lib/voice/conversation-core";
import { loadDraftMutation, resolveActiveConversation, setDraftMutation, type DraftMutationRecord } from "@/lib/voice/conversation-memory";
import { repairId } from "@/lib/voice/id-repair";
import { loadEntityContext, loadUserTimezone, type EntityContext } from "@/lib/voice/intent";
import type { PendingMutation } from "@/lib/voice/mutations";
import {
  confirmVoiceSession,
  declineVoiceSession,
  proposeMutationForCall,
  VoiceSessionExpiredError,
  VoiceSessionInvalidStateError,
  VoiceSessionNotFoundError,
  type CallProposalResult,
  type VoiceConfirmResult,
} from "@/lib/voice/session";
import { classifyYesNo } from "@/lib/voice/yes-no";
import { EXCLUDED_FROM_CALL, FINALIZING_CALL_TOOLS } from "@/lib/voice/realtime/tools";

/**
 * Runs one tool call from a Realtime voice call.
 *
 * Transport-independent on purpose: the HTTP route (POST /api/voice/realtime/
 * tool) and the Realtime eval driver both call executeCallTool, so what the
 * eval grades is the code that ships. Everything that touches the database or
 * the existing voice pipeline goes through `CallToolPorts`, which production
 * wires to the real modules (createCallToolPorts) and tests replace with fakes.
 *
 * The model's output is untrusted in the same way a browser is: it never gets
 * to name a user, only to ask for things, and every id it supplies is checked
 * against what this user actually owns. Confirming a change is the one step
 * with real consequences, so it is gated here, not left to the prompt.
 */

export interface PendingSessionRow {
  id: string;
  /** What the user said when this was proposed (voice_sessions.transcript). */
  transcript: string | null;
  pending_mutation: PendingMutation | null;
}

export interface CallState {
  context: EntityContext;
  timezone: string;
  conversationId: string;
}

export interface CallToolPorts {
  loadState(): Promise<CallState>;
  loadDraft(conversationId: string): Promise<DraftMutationRecord | null>;
  saveDraft(conversationId: string, draft: DraftMutationRecord | null): Promise<void>;
  dispatch(call: ToolCallLike, state: CallState, now: Date): Promise<ToolDispatchResult>;
  propose(outcome: Parameters<typeof proposeMutationForCall>[2], heardTranscript: string | null): Promise<CallProposalResult>;
  /** The caller's sessions currently in AwaitingConfirmation (RLS-scoped). */
  listAwaitingSessions(): Promise<PendingSessionRow[]>;
  confirm(sessionId: string): Promise<VoiceConfirmResult>;
  decline(sessionId: string): Promise<{ message: string }>;
}

export interface ExecuteCallToolInput {
  name: string;
  /** The model's raw JSON-string arguments. */
  arguments: string;
  /** The user's most recent completed utterance on this call, as transcribed. */
  lastUserTranscript: string | null;
  /** Names of every function call in the same model response, this one included. */
  batch: readonly string[];
}

export interface CallToolUi {
  citations?: KnowledgeCitation[];
  extractionLabel?: "machine_extracted";
  /** A proposal is waiting on the user: the screen shows Confirm / Cancel. */
  pending?: { sessionId: string; summary: string; requiresTap: boolean };
  /** A change was carried out (or declined): the screen's pending card clears. */
  resolved?: { sessionId: string; outcome: "executed" | "declined"; summary: string };
}

export interface CallToolResult {
  /** Becomes the function_call_output the model reads next. */
  output: Record<string, unknown>;
  ui?: CallToolUi;
  /** The model asked to hang up. */
  endCall?: boolean;
  /** Entity data changed: the client should refresh the model's context. */
  contextChanged?: boolean;
}

const sessionIdArgsSchema = z.object({ session_id: z.string().min(1) });

/**
 * Changes that must be confirmed with a tap, never by voice alone: ones whose
 * effect is wide or hard to undo, where a misheard "yes" costs the most.
 */
export function requiresTapToConfirm(mutation: PendingMutation | null): boolean {
  if (!mutation) return false;
  if (mutation.targetType === "course" && mutation.operation === "delete") return true;
  if (mutation.targetType === "deadline" && mutation.operation === "transition" && mutation.cancelScope === "series") return true;
  return false;
}

const normalizeSpeech = (text: string | null) => (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const error = (message: string): CallToolResult => ({ output: { error: message } });

function isExcluded(name: string): boolean {
  return (EXCLUDED_FROM_CALL as readonly string[]).includes(name);
}

export async function executeCallTool(ports: CallToolPorts, input: ExecuteCallToolInput, now: Date = new Date()): Promise<CallToolResult> {
  const { name } = input;
  const call: ToolCallLike = { name, arguments: input.arguments };

  if (isExcluded(name)) return error(`${name} is not available on a voice call.`);

  // A change proposal ends the model's turn, so it must come after the lookups
  // it depends on, not alongside them -- the same rule the text loop enforces.
  if ((FINALIZING_CALL_TOOLS as readonly string[]).includes(name) && input.batch.length > 1) {
    return error(`${name} must be the only tool call in a response. Make any lookups first, then call ${name} on its own.`);
  }
  // Likewise a confirm can never ride along with the proposal it confirms.
  if ((name === "confirm_pending_mutation" || name === "decline_pending_mutation") && input.batch.some((other) => other === "propose_mutation")) {
    return error("Do not confirm in the same response as the proposal. Read the proposal aloud and wait for the user's answer.");
  }

  try {
    switch (name) {
      case "propose_mutation":
        return await proposeMutation(ports, call, input, now);
      case "save_mutation_draft":
        return await saveDraft(ports, call);
      case "confirm_pending_mutation":
        return await confirmPending(ports, call, input);
      case "decline_pending_mutation":
        return await declinePending(ports, call);
      case "end_call":
        return { output: { status: "ending" }, endCall: true };
      default:
        return await dispatchData(ports, call, now);
    }
  } catch (caught) {
    if (caught instanceof ToolArgsError || caught instanceof z.ZodError) {
      // Malformed arguments are recoverable: the model reads this and retries.
      return error(caught instanceof z.ZodError ? caught.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") : caught.message);
    }
    console.error(`[voice call] ${name} failed:`, caught instanceof Error ? caught.message : caught);
    return error("That didn't work. Tell the user you couldn't do it right now.");
  }
}

async function dispatchData(ports: CallToolPorts, call: ToolCallLike, now: Date): Promise<CallToolResult> {
  const state = await ports.loadState();
  const result = await ports.dispatch(call, state, now);
  const ui: CallToolUi = {};
  if (result.citations?.length) ui.citations = result.citations;
  if (result.extractionLabel) ui.extractionLabel = result.extractionLabel;
  return {
    output: typeof result.payload === "object" && result.payload !== null ? (result.payload as Record<string, unknown>) : { result: result.payload },
    ...(Object.keys(ui).length > 0 ? { ui } : {}),
  };
}

async function proposeMutation(ports: CallToolPorts, call: ToolCallLike, input: ExecuteCallToolInput, now: Date): Promise<CallToolResult> {
  const state = await ports.loadState();
  const draft = await ports.loadDraft(state.conversationId);
  const parsed = parseProposeMutationArgs(call, now, state.timezone, draft, state.context);

  // A gate (recurrence, duplicate card, illegal transition) turned the proposal
  // into a question. Keep what is known as the open draft, exactly as the text loop does.
  if (parsed.kind === "ask") {
    await ports.saveDraft(state.conversationId, { mutation: parsed.mutation, question: parsed.question });
    return { output: { status: "needs_answer", question: parsed.question, instruction: "Ask the user this question, then call propose_mutation again with their answer." } };
  }

  const proposed = await ports.propose(
    {
      kind: "mutation_proposal",
      confidence: parsed.confidence,
      summary: parsed.summary,
      mutation: parsed.mutation,
      conversationId: state.conversationId,
      queuedSteps: parsed.queuedSteps,
    },
    input.lastUserTranscript,
  );

  if (proposed.status === "needs_rephrase") {
    return { output: { status: "needs_rephrase", instruction: "You were not sure what the user wants. Ask them to say it again, a little differently." } };
  }

  await ports.saveDraft(state.conversationId, null);
  const requiresTap = requiresTapToConfirm(parsed.mutation);
  return {
    output: {
      status: "awaiting_confirmation",
      session_id: proposed.sessionId,
      summary: proposed.message,
      instruction: requiresTap
        ? "Read the summary aloud and ask the user. This change needs them to tap Confirm on the screen; tell them so. Do not call confirm_pending_mutation."
        : "Read the summary aloud and ask the user for a yes or no. Wait for their answer before doing anything else.",
    },
    ui: { pending: { sessionId: proposed.sessionId, summary: proposed.message, requiresTap } },
  };
}

async function saveDraft(ports: CallToolPorts, call: ToolCallLike): Promise<CallToolResult> {
  const state = await ports.loadState();
  const { question, mutation } = parseSaveMutationDraftArgs(call, state.context);
  await ports.saveDraft(state.conversationId, { mutation, question });
  return { output: { status: "draft_saved", instruction: `Ask the user: ${question}` } };
}

/** Finds the caller's pending session the model meant, tolerating a garbled copy of its id. */
async function findPending(ports: CallToolPorts, rawArgs: string): Promise<{ row: PendingSessionRow } | { problem: CallToolResult }> {
  let args: z.infer<typeof sessionIdArgsSchema>;
  try {
    args = sessionIdArgsSchema.parse(JSON.parse(rawArgs));
  } catch {
    return { problem: error("session_id is required: copy it from the propose_mutation result.") };
  }
  const pending = await ports.listAwaitingSessions();
  const id = pending.some((row) => row.id === args.session_id) ? args.session_id : repairId(args.session_id, pending.map((row) => row.id));
  const row = pending.find((candidate) => candidate.id === id);
  if (!row) {
    return {
      problem: {
        output: { status: "not_pending", error: "There is no change waiting for confirmation with that id. It may have expired or already been handled." },
      },
    };
  }
  return { row };
}

async function confirmPending(ports: CallToolPorts, call: ToolCallLike, input: ExecuteCallToolInput): Promise<CallToolResult> {
  const found = await findPending(ports, call.arguments);
  if ("problem" in found) return found.problem;
  const { row } = found;

  // Destructive changes are confirmed on screen, not by a spoken word.
  if (requiresTapToConfirm(row.pending_mutation)) {
    return { output: { status: "needs_tap", instruction: "This change has to be confirmed with the Confirm button on the screen. Tell the user, and wait." } };
  }

  // The user must have answered AFTER the proposal. Their last words being the
  // very request that produced it means no answer has come yet -- this is what
  // stops a model that "helpfully" confirms in the next breath.
  const heard = input.lastUserTranscript;
  if (!heard || normalizeSpeech(heard) === normalizeSpeech(row.transcript)) {
    return { output: { status: "not_confirmed", instruction: "The user has not answered yet. Ask for a yes or no and wait; do not confirm." } };
  }
  // The same cheap keyword read a press-to-talk confirmation uses. It errs
  // toward "no" ("yes, but stop" counts as no) -- the safe direction here.
  if (classifyYesNo(heard) !== "yes") {
    return { output: { status: "not_confirmed", instruction: "The user's last words were not a clear yes. Ask again, or decline if they said no. Do not confirm." } };
  }

  try {
    const confirmed = await ports.confirm(row.id);
    return {
      output: {
        status: "executed",
        summary: confirmed.result.summary,
        ...(confirmed.next ? { next_session_id: confirmed.next.sessionId, next_summary: confirmed.next.message, instruction: "Tell the user it is done, then read the next step's summary aloud and ask for a yes or no." } : { instruction: "Tell the user it is done." }),
      },
      ui: {
        resolved: { sessionId: row.id, outcome: "executed", summary: confirmed.result.summary },
        ...(confirmed.next ? { pending: { sessionId: confirmed.next.sessionId, summary: confirmed.next.message, requiresTap: false } } : {}),
      },
      contextChanged: true,
    };
  } catch (caught) {
    if (caught instanceof VoiceSessionExpiredError) {
      return { output: { status: "expired", instruction: "That took too long and the change expired. Tell the user, and offer to set it up again." } };
    }
    if (caught instanceof VoiceSessionNotFoundError || caught instanceof VoiceSessionInvalidStateError) {
      return { output: { status: "not_pending", error: "That change is no longer waiting for confirmation." } };
    }
    throw caught;
  }
}

async function declinePending(ports: CallToolPorts, call: ToolCallLike): Promise<CallToolResult> {
  const found = await findPending(ports, call.arguments);
  if ("problem" in found) return found.problem;
  try {
    const declined = await ports.decline(found.row.id);
    return {
      output: { status: "declined", instruction: "Tell the user you won't do it." },
      ui: { resolved: { sessionId: found.row.id, outcome: "declined", summary: declined.message } },
    };
  } catch (caught) {
    if (caught instanceof VoiceSessionNotFoundError || caught instanceof VoiceSessionInvalidStateError || caught instanceof VoiceSessionExpiredError) {
      return { output: { status: "not_pending", error: "That change is no longer waiting for confirmation." } };
    }
    throw caught;
  }
}

/** Production wiring: every port backed by the real, RLS-scoped modules. Never given a service-role client. */
export function createCallToolPorts(supabase: SupabaseClient<Database>, userId: string): CallToolPorts {
  return {
    async loadState() {
      const [context, timezone, conversation] = await Promise.all([
        loadEntityContext(supabase, userId),
        loadUserTimezone(supabase, userId),
        resolveActiveConversation(supabase, userId),
      ]);
      return { context, timezone, conversationId: conversation.conversationId };
    },
    loadDraft: (conversationId) => loadDraftMutation(supabase, userId, conversationId),
    saveDraft: (conversationId, draft) => setDraftMutation(supabase, userId, conversationId, draft),
    dispatch: (call, state, now) => dispatchTool(call, supabase, userId, state.conversationId, state.context, now),
    propose: (outcome, heardTranscript) => proposeMutationForCall(supabase, userId, outcome, heardTranscript),
    async listAwaitingSessions() {
      const { data, error: queryError } = await supabase
        .from("voice_sessions")
        .select("id, transcript, pending_mutation")
        .eq("user_id", userId)
        .eq("state", "AwaitingConfirmation")
        .order("created_at", { ascending: false })
        .limit(10);
      if (queryError) throw new Error(`pending session lookup failed: ${queryError.message}`);
      return (data ?? []).map((row) => ({ id: row.id, transcript: row.transcript, pending_mutation: row.pending_mutation as PendingMutation | null }));
    },
    confirm: (sessionId) => confirmVoiceSession(supabase, userId, sessionId),
    decline: (sessionId) => declineVoiceSession(supabase, userId, sessionId),
  };
}
