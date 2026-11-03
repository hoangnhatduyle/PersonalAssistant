import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon" }, requireEnv: (name: string) => `fake-${name}` }));
// The driver module imports the SDK's ws client at load; the tests never open a real connection.
vi.mock("openai/realtime/ws", () => ({ OpenAIRealtimeWS: { create: vi.fn() } }));

const { EventTransport, runRealtimeTurns } = await import("../../../../evals/realtime-driver");
const { MUTATION_FIELD_NAMES } = await import("@/lib/voice/tools");
type RealtimeTransport = import("../../../../evals/realtime-driver").RealtimeTransport;
type CallToolPorts = import("@/lib/voice/realtime/tool-executor").CallToolPorts;

const CONVERSATION_ID = "conv-1";
const COURSE_ID = "99999999-9999-4999-8999-999999999999";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-1111-4111-8111-111111111111";

type Sent = Record<string, unknown>;

/** A transport whose server side is a script: each response.create is answered by the next queued response.done. */
class ScriptedTransport implements RealtimeTransport {
  sent: Sent[] = [];
  private pending: Sent[] = [];
  closed = false;
  constructor(private readonly responses: Sent[]) {}
  send(event: Sent) {
    this.sent.push(event);
    if (event.type === "response.create") {
      const next = this.responses.shift();
      if (!next) throw new Error("the script ran out of responses -- the loop asked for more than expected");
      this.pending.push({ type: "response.done", response: next });
    }
  }
  async waitFor(type: string) {
    const index = this.pending.findIndex((event) => event.type === type);
    if (index < 0) throw new Error(`timed out waiting for ${type}`);
    return this.pending.splice(index, 1)[0] as { type: string };
  }
  close() {
    this.closed = true;
  }
  ofType(type: string) {
    return this.sent.filter((event) => event.type === type);
  }
}

const say = (text: string, usage?: Sent): Sent => ({ output: [{ type: "message", content: [{ type: "output_text", text }] }], usage });
const callTool = (name: string, args: unknown = {}, id = `call_${name}`): Sent => ({ type: "function_call", call_id: id, name, arguments: JSON.stringify(args) });
const respond = (...output: Sent[]): Sent => ({ output });

const context = {
  courses: [{ id: COURSE_ID, code: "CS101", name: "Algorithms" }],
  deadlines: [],
  tasks: [{ id: TASK_ID, title: "Pay rent", list_id: null, status: "Open", validEvents: ["user_marks_done", "user_cancels"] }],
  todoLists: [],
  sessions: [],
  appointments: [],
  knowledgeSources: [],
  people: [],
};
const allNull = Object.fromEntries(MUTATION_FIELD_NAMES.map((field) => [field, null]));

function makePorts(overrides: Partial<CallToolPorts> = {}): CallToolPorts & { dispatch: ReturnType<typeof vi.fn> } {
  return {
    loadState: vi.fn(async () => ({ context: context as never, timezone: "America/New_York", conversationId: CONVERSATION_ID })),
    loadDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => ({ payload: { overdueItems: [], rankedSchedule: [] } })),
    propose: vi.fn(async () => ({ status: "awaiting_confirmation" as const, sessionId: SESSION_ID, message: "Delete the task Pay rent" })),
    listAwaitingSessions: vi.fn(async () => []),
    confirm: vi.fn(),
    decline: vi.fn(),
    ...overrides,
  } as never;
}

const run = (responses: Sent[], turns: string[], ports = makePorts()) => {
  const transport = new ScriptedTransport(responses);
  return { transport, ports, result: runRealtimeTurns({ transport, ports, conversationId: CONVERSATION_ID, now: () => new Date("2026-11-03T15:00:00.000Z") }, turns) };
};

describe("runRealtimeTurns", () => {
  it("records a plain spoken answer, its timing and its token use", async () => {
    const { transport, result } = run([say("You have two things due.", { input_tokens: 1000, output_tokens: 40, input_token_details: { cached_tokens: 900 }, output_token_details: { reasoning_tokens: 5 } })], ["what's due"]);
    const [record] = await result;

    expect(record).toMatchObject({
      transcript: "what's due",
      outcome: { kind: "answer", message: "You have two things due.", needsFollowUp: false, conversationId: CONVERSATION_ID },
      toolCalls: [],
      modelCalls: 1,
      inputTokens: 1000,
      cachedInputTokens: 900,
      outputTokens: 40,
      reasoningTokens: 5,
    });
    expect(record.wallMs).toBeGreaterThanOrEqual(0);
    expect(transport.ofType("conversation.item.create")[0]).toMatchObject({ item: { role: "user", content: [{ type: "input_text", text: "what's due" }] } });
  });

  it("treats a question as needing a follow-up", async () => {
    const [record] = await run([say("Which course is that for?")], ["add a deadline"]).result;
    expect(record.outcome).toMatchObject({ kind: "answer", needsFollowUp: true });
  });

  it("runs a lookup through the shipped executor and gives the model its result", async () => {
    const ports = makePorts();
    const { transport, result } = run([respond(callTool("get_schedule", { window: "week", date: null })), say("Nothing this week.")], ["anything this week?"], ports);
    const [record] = await result;

    expect(ports.dispatch).toHaveBeenCalledTimes(1);
    expect(record.toolCalls).toEqual([{ name: "get_schedule", arguments: JSON.stringify({ window: "week", date: null }) }]);
    expect(record.modelCalls).toBe(2);
    expect(record.outcome).toMatchObject({ kind: "answer", message: "Nothing this week." });
    const output = transport.ofType("conversation.item.create").find((e) => (e.item as { type: string }).type === "function_call_output");
    expect(output).toMatchObject({ item: { call_id: "call_get_schedule", output: JSON.stringify({ overdueItems: [], rankedSchedule: [] }) } });
  });

  it("reports an accepted proposal as a mutation_proposal, whatever the model then says aloud", async () => {
    const args = { ...allNull, confidence: 0.97, summary: "Delete the task Pay rent", target_type: "task", operation: "delete", target_id: TASK_ID, additional_steps: null };
    const ports = makePorts();
    const { result } = run([respond(callTool("propose_mutation", args)), say("I'll delete Pay rent. Okay?")], ["delete my rent task"], ports);
    const [record] = await result;

    expect(record.outcome).toMatchObject({ kind: "mutation_proposal", confidence: 0.97, summary: "Delete the task Pay rent", mutation: { targetType: "task", operation: "delete", targetId: TASK_ID }, conversationId: CONVERSATION_ID });
    // The user's own words reach the executor as their last utterance.
    expect(ports.propose).toHaveBeenCalledWith(expect.anything(), "delete my rent task");
  });

  it("reports a gate's clarifying question as an answer carrying the open draft", async () => {
    // A deadline create that never says whether it repeats: the recurrence gate asks.
    const args = {
      ...allNull,
      confidence: 0.97,
      summary: "Add the deadline",
      target_type: "deadline",
      operation: "create",
      course_id: COURSE_ID,
      title: "Essay",
      due_at: "2026-11-06T22:00:00.000Z",
      additional_steps: null,
    };
    const ports = makePorts();
    const { result } = run([respond(callTool("propose_mutation", args)), say("Should this deadline repeat weekly?")], ["add an essay deadline for algorithms friday"], ports);
    const [record] = await result;

    expect(record.outcome).toMatchObject({ kind: "answer", message: "Should this deadline repeat weekly?", needsFollowUp: true });
    expect((record.outcome as { draftMutation?: unknown }).draftMutation).toBeTruthy();
    expect(ports.propose).not.toHaveBeenCalled();
  });

  it("does not count a recorded-then-cleared draft as an open one", async () => {
    const args = { ...allNull, confidence: 0.97, summary: "Delete the task Pay rent", target_type: "task", operation: "delete", target_id: TASK_ID, additional_steps: null };
    const [record] = await run([respond(callTool("propose_mutation", args)), say("Okay?")], ["delete rent"]).result;
    expect(record.outcome.kind).toBe("mutation_proposal");
    expect(record.outcome).not.toHaveProperty("draftMutation");
  });

  it("feeds the executor's refusal back to the model rather than hiding it", async () => {
    const ports = makePorts();
    const { transport, result } = run([respond(callTool("confirm_pending_mutation", { session_id: SESSION_ID })), say("Sorry, I need your yes first.")], ["delete rent"], ports);
    const [record] = await result;
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(record.toolCalls.map((c) => c.name)).toEqual(["confirm_pending_mutation"]);
    const output = transport.ofType("conversation.item.create").find((e) => (e.item as { type: string }).type === "function_call_output");
    expect(JSON.parse((output!.item as { output: string }).output)).toMatchObject({ status: "not_pending" });
  });

  it("keeps one session across turns, so a follow-up sees what came before", async () => {
    const { transport, result } = run([say("First answer."), say("Second answer.")], ["first question", "second question"]);
    const records = await result;
    expect(records.map((r) => r.transcript)).toEqual(["first question", "second question"]);
    expect(records.map((r) => (r.outcome as { message: string }).message)).toEqual(["First answer.", "Second answer."]);
    expect(transport.ofType("conversation.item.create")).toHaveLength(2);
  });

  it("stops at end_call without asking the model for another response", async () => {
    const { transport, result } = run([respond(callTool("end_call"))], ["thanks, bye"]);
    const [record] = await result;
    expect(record.toolCalls).toEqual([{ name: "end_call", arguments: "{}" }]);
    expect(transport.ofType("response.create")).toHaveLength(1);
  });

  it("gives up after a bounded number of responses instead of looping forever", async () => {
    const responses = Array.from({ length: 20 }, (_, i) => respond(callTool("get_schedule", { window: "week", date: null }, `c${i}`)));
    const { transport, result } = run(responses, ["loop"]);
    const [record] = await result;
    expect(record.modelCalls).toBe(8);
    expect(transport.ofType("response.create").length).toBeLessThanOrEqual(8);
  });

  it("rejects when the server never answers, so the case fails loudly", async () => {
    const transport = new ScriptedTransport([]);
    transport.send = () => undefined; // nothing ever comes back
    await expect(runRealtimeTurns({ transport, ports: makePorts(), conversationId: CONVERSATION_ID }, ["hello"])).rejects.toThrow(/timed out waiting for response.done/);
  });
});

describe("EventTransport", () => {
  class FakeSocket extends EventEmitter {
    sent: string[] = [];
    closed = false;
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
    emitEvent(event: Record<string, unknown>) {
      this.emit("message", Buffer.from(JSON.stringify(event)));
    }
  }
  let socket: FakeSocket;
  let transport: InstanceType<typeof EventTransport>;
  beforeEach(() => {
    socket = new FakeSocket();
    transport = new EventTransport(socket as never);
  });

  it("serialises what it sends", () => {
    transport.send({ type: "response.create" });
    expect(socket.sent).toEqual([JSON.stringify({ type: "response.create" })]);
  });

  it("hands over an event that arrived before anyone asked for it", async () => {
    socket.emitEvent({ type: "response.done", n: 1 });
    await expect(transport.waitFor("response.done")).resolves.toMatchObject({ n: 1 });
  });

  it("resolves a waiter when its event arrives, and ignores events of other types in between", async () => {
    const waiting = transport.waitFor("response.done");
    socket.emitEvent({ type: "response.created" });
    socket.emitEvent({ type: "response.done", n: 2 });
    await expect(waiting).resolves.toMatchObject({ n: 2 });
  });

  it("delivers events of the same type in order", async () => {
    socket.emitEvent({ type: "response.done", n: 1 });
    socket.emitEvent({ type: "response.done", n: 2 });
    expect(await transport.waitFor("response.done")).toMatchObject({ n: 1 });
    expect(await transport.waitFor("response.done")).toMatchObject({ n: 2 });
  });

  it("fails a waiter with the server's error rather than leaving it to time out", async () => {
    const waiting = transport.waitFor("response.done");
    socket.emitEvent({ type: "error", error: { message: "bad tool schema" } });
    await expect(waiting).rejects.toThrow(/bad tool schema/);
  });

  it("times out a wait that is never satisfied", async () => {
    await expect(transport.waitFor("session.updated", 20)).rejects.toThrow(/timed out after 20ms waiting for session.updated/);
  });

  it("ignores non-JSON frames, and closes the socket", () => {
    socket.emit("message", Buffer.from("not json"));
    transport.close();
    expect(socket.closed).toBe(true);
  });
});
