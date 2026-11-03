import { EventEmitter, once } from "node:events";
import OpenAI from "openai";
import { OpenAIRealtimeWS } from "openai/realtime/ws";
import type { ConversationMutationProposal, ConversationTurnOutcome } from "@/lib/voice/conversation-core";
import type { DraftMutationRecord } from "@/lib/voice/conversation-memory";
import { loadEntityContext, loadUserTimezone } from "@/lib/voice/intent";
import { buildSessionConfig, resolveModel } from "@/lib/voice/realtime/session-config";
import { buildCallInstructions } from "@/lib/voice/realtime/session-state";
import { createCallToolPorts, executeCallTool, type CallToolPorts } from "@/lib/voice/realtime/tool-executor";
import { requireEnv } from "@/lib/env";
import type { TurnRecord } from "./cases";
import type { TurnDriver } from "./drivers";
import type { EvalFixture } from "./fixture";
import { freshConversation } from "./fresh-conversation";

/**
 * Grades the Realtime call path with the same cases as the text pipeline.
 *
 * It opens a real Realtime session configured exactly as production configures
 * one (buildSessionConfig + buildCallInstructions -- the same modules the
 * session route uses), except that the model answers in TEXT: audio would add
 * cost and no signal for what these cases check, which is whether the model
 * picks the right tool, passes the right arguments, and says the right thing.
 * What it cannot judge is voice quality or turn-taking; those are on-device.
 *
 * Every tool call goes through executeCallTool -- the code behind POST
 * /api/voice/realtime/tool -- against the fixture user's own RLS-scoped client,
 * so the eval exercises the shipped executor, not a copy of it.
 *
 * The conversation loop is separate from the network (RealtimeTransport) so it
 * can be unit-tested with a scripted fake: src/lib/voice/__tests__/
 * realtime-eval-driver.test.ts.
 */

type ServerEvent = { type: string; [key: string]: unknown };

export interface RealtimeTransport {
  send(event: Record<string, unknown>): void;
  /** Resolves with the next event of `type`, or rejects on a server error event or after `timeoutMs`. */
  waitFor(type: string, timeoutMs?: number): Promise<ServerEvent>;
  close(): void;
}

/** What a ws-style socket needs to provide. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  on(event: "message", listener: (data: { toString(): string }) => void): unknown;
}

const DEFAULT_WAIT_MS = 90_000;
/** A runaway guard: no case needs more model round trips than this in one turn. */
const MAX_RESPONSES_PER_TURN = 8;

/**
 * Buffers server events by type so a caller can wait for "the next
 * response.done" without racing the messages that arrive in between. An `error`
 * event fails whoever is waiting rather than being silently dropped.
 */
export class EventTransport implements RealtimeTransport {
  private buffer: ServerEvent[] = [];
  private waiters: Array<{ type: string; resolve: (event: ServerEvent) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(private readonly socket: SocketLike) {
    socket.on("message", (data) => {
      try {
        this.push(JSON.parse(data.toString()) as ServerEvent);
      } catch {
        // Not JSON: nothing a case could be waiting for.
      }
    });
  }

  send(event: Record<string, unknown>): void {
    this.socket.send(JSON.stringify(event));
  }

  close(): void {
    for (const waiter of this.waiters) clearTimeout(waiter.timer);
    this.waiters = [];
    this.socket.close();
  }

  waitFor(type: string, timeoutMs: number = DEFAULT_WAIT_MS): Promise<ServerEvent> {
    const buffered = this.buffer.findIndex((event) => event.type === type);
    if (buffered >= 0) return Promise.resolve(this.buffer.splice(buffered, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error(`timed out after ${timeoutMs}ms waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push({ type, resolve, reject, timer });
    });
  }

  private push(event: ServerEvent): void {
    if (event.type === "error") {
      const failed = this.waiters;
      this.waiters = [];
      const detail = JSON.stringify(event.error ?? event);
      for (const waiter of failed) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`realtime error: ${detail}`));
      }
      return;
    }
    const index = this.waiters.findIndex((waiter) => waiter.type === event.type);
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(event);
    } else {
      this.buffer.push(event);
    }
  }
}

interface OutputItem {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string; transcript?: string }>;
}

interface ResponseDone {
  response?: {
    output?: OutputItem[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_token_details?: { cached_tokens?: number };
      output_token_details?: { reasoning_tokens?: number };
    };
  };
}

function textOf(item: OutputItem): string {
  return (item.content ?? []).map((part) => part.text ?? part.transcript ?? "").join("");
}

export interface RealtimeTurnDeps {
  transport: RealtimeTransport;
  ports: CallToolPorts;
  conversationId: string;
  now?: () => Date;
  waitMs?: number;
}

/** Runs the user's turns through an already-configured session, returning one record per turn. */
export async function runRealtimeTurns(deps: RealtimeTurnDeps, turns: string[]): Promise<TurnRecord[]> {
  const { transport, conversationId } = deps;
  const records: TurnRecord[] = [];

  // What the executor did this turn, captured without changing what it does.
  let proposal: ConversationMutationProposal | null = null;
  let draft: DraftMutationRecord | null | undefined;
  const ports: CallToolPorts = {
    ...deps.ports,
    propose: async (outcome, heard) => {
      const result = await deps.ports.propose(outcome, heard);
      if (result.status === "awaiting_confirmation") proposal = outcome;
      return result;
    },
    saveDraft: async (id, saved) => {
      draft = saved;
      return deps.ports.saveDraft(id, saved);
    },
  };

  for (const text of turns) {
    proposal = null;
    draft = undefined;
    const toolCalls: Array<{ name: string; arguments: string }> = [];
    const usage = { input: 0, cached: 0, output: 0, reasoning: 0 };
    let modelCalls = 0;
    let finalText = "";
    const started = Date.now();

    transport.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
    transport.send({ type: "response.create" });

    let hungUp = false;
    for (let round = 0; round < MAX_RESPONSES_PER_TURN && !hungUp; round++) {
      const done = (await transport.waitFor("response.done", deps.waitMs)) as unknown as ResponseDone & ServerEvent;
      modelCalls += 1;
      usage.input += done.response?.usage?.input_tokens ?? 0;
      usage.output += done.response?.usage?.output_tokens ?? 0;
      usage.cached += done.response?.usage?.input_token_details?.cached_tokens ?? 0;
      usage.reasoning += done.response?.usage?.output_token_details?.reasoning_tokens ?? 0;

      const output = done.response?.output ?? [];
      const calls = output.filter((item) => item.type === "function_call");
      const said = output.filter((item) => item.type === "message").map(textOf).join(" ").trim();
      if (said) finalText = said;
      if (calls.length === 0) break;

      const batch = calls.map((call) => call.name ?? "");
      for (const call of calls) {
        toolCalls.push({ name: call.name ?? "", arguments: call.arguments ?? "" });
        const result = await executeCallTool(ports, { name: call.name ?? "", arguments: call.arguments ?? "", lastUserTranscript: text, batch }, deps.now?.() ?? new Date());
        transport.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result.output) } });
        if (result.endCall) hungUp = true;
      }
      // Not on the last round: that response would never be read, only paid for.
      if (!hungUp && round < MAX_RESPONSES_PER_TURN - 1) transport.send({ type: "response.create" });
    }

    const outcome: ConversationTurnOutcome = proposal
      ? proposal
      : {
          kind: "answer",
          message: finalText,
          needsFollowUp: finalText.trim().endsWith("?"),
          conversationId,
          ...(draft ? { draftMutation: draft } : {}),
        };

    records.push({
      transcript: text,
      outcome,
      toolCalls,
      wallMs: Date.now() - started,
      modelCalls,
      inputTokens: usage.input,
      cachedInputTokens: usage.cached,
      outputTokens: usage.output,
      reasoningTokens: usage.reasoning,
    });
  }
  return records;
}

/** The production session config, with the model answering in text (see the file header). */
function evalSessionConfig(instructions: string) {
  // `audio: undefined` is dropped when serialised; the audio block configures voice and turn
  // detection, neither of which applies to a text-only run.
  return { ...buildSessionConfig({ instructions }), audio: undefined, output_modalities: ["text" as const] };
}

async function openTransport(): Promise<{ transport: EventTransport; model: string }> {
  const model = resolveModel();
  const realtime = await OpenAIRealtimeWS.create(new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") }), { model });
  if (realtime.socket.readyState !== 1) await once(realtime.socket as unknown as EventEmitter, "open");
  const transport = new EventTransport({
    send: (data) => realtime.socket.send(data),
    close: () => realtime.close(),
    on: (event, listener) => realtime.socket.on(event, listener),
  });
  return { transport, model };
}

export const realtimeDriver: TurnDriver = {
  id: "realtime",
  async runCase(f: EvalFixture, turns: string[]): Promise<TurnRecord[]> {
    const conversationId = await freshConversation(f);
    const { instructions } = await buildCallInstructions(f.client, f.userId, new Date(), conversationId);

    // The shipped ports, except that the conversation is this case's own, so concurrent cases
    // sharing one fixture user cannot see each other's drafts.
    const base = createCallToolPorts(f.client, f.userId);
    const ports: CallToolPorts = {
      ...base,
      async loadState() {
        const [context, timezone] = await Promise.all([loadEntityContext(f.client, f.userId), loadUserTimezone(f.client, f.userId)]);
        return { context, timezone, conversationId };
      },
    };

    const { transport } = await openTransport();
    try {
      transport.send({ type: "session.update", session: evalSessionConfig(instructions) });
      await transport.waitFor("session.updated");
      return await runRealtimeTurns({ transport, ports, conversationId }, turns);
    } finally {
      transport.close();
    }
  },
};
