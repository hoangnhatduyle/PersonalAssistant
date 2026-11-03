import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon" }, requireEnv: (name: string) => `fake-${name}` }));

const { executeCallTool, requiresTapToConfirm } = await import("../tool-executor");
const { ToolArgsError } = await import("@/lib/voice/conversation-core");
const { MUTATION_FIELD_NAMES } = await import("@/lib/voice/tools");
const { VoiceSessionExpiredError, VoiceSessionInvalidStateError } = await import("@/lib/voice/session");
type CallToolPorts = import("../tool-executor").CallToolPorts;
type PendingSessionRow = import("../tool-executor").PendingSessionRow;

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const GARBLED_SESSION_ID = "aaaaaaaa-1111-4111-8111-1111ffffffff";
const CONVERSATION_ID = "conv-1";

const context = {
  courses: [],
  deadlines: [],
  tasks: [{ id: TASK_ID, title: "Pay rent", list_id: null, status: "Open", validEvents: ["user_marks_done", "user_cancels"] }],
  todoLists: [],
  sessions: [],
  appointments: [],
  knowledgeSources: [],
  people: [],
};

const proposeArgs = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    confidence: 0.97,
    summary: "Delete the task Pay rent",
    target_type: "task",
    operation: "delete",
    target_id: TASK_ID,
    course_id: null,
    title: null,
    due_at: null,
    body: null,
    priority: null,
    reminder_lead_minutes: null,
    event: null,
    snooze_until: null,
    ...overrides,
  });

function makePorts(overrides: Partial<CallToolPorts> = {}) {
  const ports = {
    loadState: vi.fn(async () => ({ context: context as never, timezone: "America/New_York", conversationId: CONVERSATION_ID })),
    loadDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => ({ payload: { overdueItems: [], rankedSchedule: [] } })),
    propose: vi.fn(async () => ({ status: "awaiting_confirmation" as const, sessionId: SESSION_ID, message: "Delete the task Pay rent" })),
    listAwaitingSessions: vi.fn(async (): Promise<PendingSessionRow[]> => [{ id: SESSION_ID, transcript: "delete my rent task", pending_mutation: { targetType: "task", operation: "delete", targetId: TASK_ID } }]),
    confirm: vi.fn(async () => ({ executed: true, result: { summary: "Deleted the task Pay rent.", data: {} }, next: null })),
    decline: vi.fn(async () => ({ message: "Okay, I won't delete it." })),
    ...overrides,
  };
  return ports satisfies CallToolPorts;
}

const run = (ports: CallToolPorts, name: string, args: unknown, extra: { lastUserTranscript?: string | null; batch?: string[] } = {}) =>
  executeCallTool(ports, { name, arguments: typeof args === "string" ? args : JSON.stringify(args), lastUserTranscript: extra.lastUserTranscript ?? null, batch: extra.batch ?? [name] }, new Date("2026-11-03T15:00:00.000Z"));

describe("executeCallTool: guard rails", () => {
  it.each(["respond_to_user", "start_new_conversation", "get_personalization_suggestions"])("refuses %s, which a call does not offer", async (name) => {
    const ports = makePorts();
    const result = await run(ports, name, {});
    expect(result.output.error).toMatch(/not available on a voice call/);
    expect(ports.dispatch).not.toHaveBeenCalled();
  });

  it.each(["propose_mutation", "save_mutation_draft"])("rejects %s when other calls share its response", async (name) => {
    const ports = makePorts();
    const result = await run(ports, name, proposeArgs(), { batch: ["get_schedule", name] });
    expect(result.output.error).toMatch(/only tool call in a response/);
    expect(ports.propose).not.toHaveBeenCalled();
    expect(ports.saveDraft).not.toHaveBeenCalled();
  });

  it.each(["confirm_pending_mutation", "decline_pending_mutation"])("rejects %s in the same response as the proposal", async (name) => {
    const ports = makePorts();
    const result = await run(ports, name, { session_id: SESSION_ID }, { lastUserTranscript: "yes", batch: ["propose_mutation", name] });
    expect(result.output.error).toMatch(/same response as the proposal/);
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.decline).not.toHaveBeenCalled();
  });

  it("turns an unexpected failure into a spoken-safe error without leaking its message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ports = makePorts({ dispatch: vi.fn(async () => Promise.reject(new Error("connection string postgres://secret"))) });
    const result = await run(ports, "get_schedule", { window: "week", date: null });
    expect(JSON.stringify(result.output)).not.toContain("secret");
    expect(result.output.error).toMatch(/Tell the user you couldn't do it right now/);
    spy.mockRestore();
  });
});

describe("executeCallTool: data tools", () => {
  it("returns the lookup payload as the model's output", async () => {
    const ports = makePorts({ dispatch: vi.fn(async () => ({ payload: { message: "2 of 3 sessions done." } })) });
    const result = await run(ports, "get_deadline_progress", { deadline_id: TASK_ID });
    expect(result.output).toEqual({ message: "2 of 3 sessions done." });
    expect(result.ui).toBeUndefined();
    expect(ports.dispatch).toHaveBeenCalledWith({ name: "get_deadline_progress", arguments: JSON.stringify({ deadline_id: TASK_ID }) }, expect.objectContaining({ conversationId: CONVERSATION_ID }), expect.any(Date));
  });

  it("forwards citations and the extraction label to the screen, not to the model", async () => {
    const citations = [{ sourceId: "s-1", title: "Notes" }] as never;
    const ports = makePorts({ dispatch: vi.fn(async () => ({ payload: { answer: "Cherry blossoms." }, citations, extractionLabel: "machine_extracted" as const })) });
    const result = await run(ports, "lookup_knowledge", { query: "bucket list" });
    expect(result.output).toEqual({ answer: "Cherry blossoms." });
    expect(result.ui).toEqual({ citations, extractionLabel: "machine_extracted" });
  });

  it("returns malformed arguments to the model as a recoverable error", async () => {
    const ports = makePorts({ dispatch: vi.fn(async () => Promise.reject(new ToolArgsError("get_schedule received invalid arguments: window: Invalid option"))) });
    const result = await run(ports, "get_schedule", { window: "someday" });
    expect(result.output).toEqual({ error: "get_schedule received invalid arguments: window: Invalid option" });
  });
});

describe("executeCallTool: person schedules", () => {
  const PERSON_ID = "77777777-7777-4777-8777-777777777777";
  const withPeople = () =>
    makePorts({
      loadState: vi.fn(async () => ({
        context: { ...context, people: [{ id: PERSON_ID, name: "Châu", relationship: "sister" }] } as never,
        timezone: "America/New_York",
        conversationId: CONVERSATION_ID,
      })),
      dispatch: vi.fn(async () => ({ payload: { rankedSchedule: [], overdueItems: [] } })),
    });

  it("says whose schedule it is, and tells the model not to read it out for a different name", async () => {
    const result = await run(withPeople(), "get_person_schedule", { person_id: PERSON_ID, window: "date", date: "2026-11-04" });
    expect(result.output).toMatchObject({ rankedSchedule: [], schedule_for: { name: "Châu", relationship: "sister" } });
    expect(String(result.output.reminder)).toMatch(/Châu's schedule only.*different name.*don't have anyone tracked by that name/);
  });

  it("still names the person when the model garbled the id", async () => {
    const result = await run(withPeople(), "get_person_schedule", { person_id: "77777777-7777-4777-8777-7777777fffff", window: "date", date: "2026-11-04" });
    expect(result.output).toMatchObject({ schedule_for: { name: "Châu" } });
  });

  it("leaves an error result, and every other tool's result, exactly as it was", async () => {
    const failing = makePorts({ dispatch: vi.fn(async () => ({ payload: { error: "Unknown person_id" } })) });
    expect((await run(failing, "get_person_schedule", { person_id: PERSON_ID, window: "date", date: null })).output).toEqual({ error: "Unknown person_id" });
    expect((await run(withPeople(), "get_schedule", { window: "week", date: null })).output).toEqual({ rankedSchedule: [], overdueItems: [] });
  });
});

describe("executeCallTool: proposing a change", () => {
  it("records a proposal, clears any open draft, and tells the screen to show Confirm / Cancel", async () => {
    const ports = makePorts();
    const result = await run(ports, "propose_mutation", proposeArgs(), { lastUserTranscript: "delete my rent task" });

    expect(result.output).toMatchObject({ status: "awaiting_confirmation", session_id: SESSION_ID, summary: "Delete the task Pay rent" });
    expect(result.ui?.pending).toEqual({ sessionId: SESSION_ID, summary: "Delete the task Pay rent", requiresTap: false });
    expect(ports.propose).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mutation_proposal", confidence: 0.97, conversationId: CONVERSATION_ID, mutation: { targetType: "task", operation: "delete", targetId: TASK_ID } }),
      "delete my rent task",
    );
    expect(ports.saveDraft).toHaveBeenLastCalledWith(CONVERSATION_ID, null);
  });

  it("flags a course delete as tap-only and tells the model not to confirm it by voice", async () => {
    const ports = makePorts();
    const result = await run(ports, "propose_mutation", proposeArgs({ target_type: "course", summary: "Delete the course Algorithms" }));
    expect(result.ui?.pending?.requiresTap).toBe(true);
    expect(result.output.instruction).toMatch(/tap Confirm on the screen/);
  });

  it("asks the model to have the user rephrase when confidence is too low, recording nothing", async () => {
    const ports = makePorts({ propose: vi.fn(async () => ({ status: "needs_rephrase" as const, summary: "x" })) });
    const result = await run(ports, "propose_mutation", proposeArgs({ confidence: 0.5 }));
    expect(result.output.status).toBe("needs_rephrase");
    expect(result.ui).toBeUndefined();
    expect(ports.saveDraft).not.toHaveBeenCalledWith(CONVERSATION_ID, null);
  });

  it("turns a malformed proposal into a recoverable error instead of failing the call", async () => {
    const ports = makePorts();
    const result = await run(ports, "propose_mutation", proposeArgs({ target_id: "not-a-uuid-at-all" }));
    expect(result.output.error).toBeTruthy();
    expect(ports.propose).not.toHaveBeenCalled();
  });

  it("repairs a garbled target id from the entity context before the proposal is recorded", async () => {
    const ports = makePorts();
    await run(ports, "propose_mutation", proposeArgs({ target_id: "11111111-1111-4111-8111-1111111fffff" }));
    expect(ports.propose).toHaveBeenCalledWith(expect.objectContaining({ mutation: expect.objectContaining({ targetId: TASK_ID }) }), null);
  });
});

describe("executeCallTool: drafts", () => {
  it("saves an incomplete change as the open draft and hands the model the question to ask", async () => {
    const ports = makePorts();
    // The tool schema requires every field to be present, null when unused.
    const allNull = Object.fromEntries(MUTATION_FIELD_NAMES.map((field) => [field, null]));
    const result = await run(ports, "save_mutation_draft", {
      ...allNull,
      question: "What time is the dentist?",
      target_type: "event",
      operation: "create",
      title: "Dentist",
      date: "2026-11-06",
      additional_steps: null,
    });
    expect(result.output).toMatchObject({ status: "draft_saved" });
    expect(String(result.output.instruction)).toContain("What time is the dentist?");
    expect(ports.saveDraft).toHaveBeenCalledWith(CONVERSATION_ID, expect.objectContaining({ question: "What time is the dentist?" }));
  });
});

describe("executeCallTool: confirming a change", () => {
  const confirm = (ports: CallToolPorts, heard: string | null, sessionId = SESSION_ID) =>
    run(ports, "confirm_pending_mutation", { session_id: sessionId }, { lastUserTranscript: heard });

  it("carries out the change on a clear spoken yes, refreshes the model's context, and clears the screen's card", async () => {
    const ports = makePorts();
    const result = await confirm(ports, "yes go ahead");
    expect(ports.confirm).toHaveBeenCalledWith(SESSION_ID);
    expect(result.output).toMatchObject({ status: "executed", summary: "Deleted the task Pay rent." });
    expect(result.contextChanged).toBe(true);
    expect(result.ui?.resolved).toEqual({ sessionId: SESSION_ID, outcome: "executed", summary: "Deleted the task Pay rent." });
  });

  it("does nothing when the model confirms without having heard an answer at all", async () => {
    const ports = makePorts();
    const result = await confirm(ports, null);
    expect(result.output.status).toBe("not_confirmed");
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it("does nothing when the user's last words are still the request that produced the proposal", async () => {
    const ports = makePorts();
    const result = await confirm(ports, "  Delete my RENT task ");
    expect(result.output).toMatchObject({ status: "not_confirmed" });
    expect(String(result.output.instruction)).toMatch(/not answered yet/);
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it.each(["no", "no thanks", "actually cancel that", "yes, but stop", "hmm let me think", "what was that again"])("does not confirm on %j", async (heard) => {
    const ports = makePorts();
    const result = await confirm(ports, heard);
    expect(result.output.status).toBe("not_confirmed");
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it.each(["yes", "yeah do it", "okay", "go ahead", "sure"])("confirms on %j", async (heard) => {
    const ports = makePorts();
    expect((await confirm(ports, heard)).output.status).toBe("executed");
  });

  it("will not confirm a tap-only change by voice, however clear the yes", async () => {
    const ports = makePorts({
      listAwaitingSessions: vi.fn(async () => [{ id: SESSION_ID, transcript: "delete algorithms", pending_mutation: { targetType: "course" as const, operation: "delete" as const, targetId: TASK_ID } }]),
    });
    const result = await confirm(ports, "yes definitely");
    expect(result.output.status).toBe("needs_tap");
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it("accepts a session id the model garbled, when exactly one pending session shares its prefix", async () => {
    const ports = makePorts();
    const result = await confirm(ports, "yes", GARBLED_SESSION_ID);
    expect(ports.confirm).toHaveBeenCalledWith(SESSION_ID);
    expect(result.output.status).toBe("executed");
  });

  it("refuses an id that matches no pending session", async () => {
    const ports = makePorts();
    const result = await confirm(ports, "yes", "99999999-9999-4999-8999-999999999999");
    expect(result.output.status).toBe("not_pending");
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it("asks for the session_id when the model omits it", async () => {
    const ports = makePorts();
    const result = await run(ports, "confirm_pending_mutation", {}, { lastUserTranscript: "yes" });
    expect(result.output.error).toMatch(/session_id is required/);
  });

  it("surfaces the next queued step so the model can read it aloud and the screen can show it", async () => {
    const ports = makePorts({
      confirm: vi.fn(async () => ({ executed: true, result: { summary: "Added Tuesday.", data: {} }, next: { sessionId: "bbbbbbbb-2222-4222-8222-222222222222", message: "Add the event on Wednesday" } })),
    });
    const result = await confirm(ports, "yes");
    expect(result.output).toMatchObject({ status: "executed", next_session_id: "bbbbbbbb-2222-4222-8222-222222222222", next_summary: "Add the event on Wednesday" });
    expect(result.ui?.pending).toEqual({ sessionId: "bbbbbbbb-2222-4222-8222-222222222222", summary: "Add the event on Wednesday", requiresTap: false });
  });

  it("tells the model a change expired instead of reporting it done", async () => {
    const ports = makePorts({ confirm: vi.fn(async () => Promise.reject(new VoiceSessionExpiredError("expired"))) });
    const result = await confirm(ports, "yes");
    expect(result.output.status).toBe("expired");
    expect(result.contextChanged).toBeUndefined();
  });

  it("treats a change already handled elsewhere (for example a tap) as no longer pending", async () => {
    const ports = makePorts({ confirm: vi.fn(async () => Promise.reject(new VoiceSessionInvalidStateError("moved on"))) });
    expect((await confirm(ports, "yes")).output.status).toBe("not_pending");
  });
});

describe("executeCallTool: declining and ending", () => {
  it("declines the pending change and clears the screen's card", async () => {
    const ports = makePorts();
    const result = await run(ports, "decline_pending_mutation", { session_id: SESSION_ID });
    expect(ports.decline).toHaveBeenCalledWith(SESSION_ID);
    expect(result.output.status).toBe("declined");
    expect(result.ui?.resolved).toMatchObject({ sessionId: SESSION_ID, outcome: "declined" });
  });

  it("end_call asks the client to hang up", async () => {
    const result = await run(makePorts(), "end_call", {});
    expect(result).toEqual({ output: { status: "ending" }, endCall: true });
  });
});

describe("requiresTapToConfirm", () => {
  it("is true for a course delete and a whole-series deadline cancel only", () => {
    expect(requiresTapToConfirm({ targetType: "course", operation: "delete", targetId: TASK_ID })).toBe(true);
    expect(requiresTapToConfirm({ targetType: "deadline", operation: "transition", targetId: TASK_ID, event: "user_cancels", cancelScope: "series" })).toBe(true);
    expect(requiresTapToConfirm({ targetType: "deadline", operation: "transition", targetId: TASK_ID, event: "user_cancels", cancelScope: "occurrence" })).toBe(false);
    expect(requiresTapToConfirm({ targetType: "task", operation: "delete", targetId: TASK_ID })).toBe(false);
    expect(requiresTapToConfirm(null)).toBe(false);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
