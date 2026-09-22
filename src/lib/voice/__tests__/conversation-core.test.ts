import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadSchedule } from "@/lib/voice/schedule-loader";

const mocks = vi.hoisted(() => ({
  chatCompletionsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mocks.chatCompletionsCreate } } };
  }),
}));

vi.mock("@/lib/voice/conversation-memory", () => ({
  loadConversationHistory: vi.fn().mockResolvedValue([]),
  endConversation: vi.fn(),
  resolveActiveConversation: vi.fn(),
  loadDraftMutation: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/voice/schedule-loader", () => ({
  loadSchedule: vi.fn().mockResolvedValue({ overdueItems: [], rankedSchedule: [], courses: [] }),
  // Mirrors the real implementation's model-facing shape: courses is
  // deliberately dropped here too (see schedule-loader.ts's doc comment on
  // toScheduleToolPayload -- a confirmed hallucination source, not just
  // dead weight) so a test asserting on this mock's output shape reflects
  // reality.
  toScheduleToolPayload: (result: { overdueItems: unknown; rankedSchedule: unknown }) => ({
    overdueItems: result.overdueItems,
    rankedSchedule: result.rankedSchedule,
  }),
}));

vi.mock("@/lib/voice/suggestions-lookup", () => ({
  runSuggestionsLookup: vi.fn().mockResolvedValue({ message: "No new suggestions right now." }),
}));

vi.mock("@/lib/voice/deadline-progress-lookup", () => ({
  runDeadlineProgressLookup: vi.fn().mockResolvedValue({ message: "2 of 3 sessions done." }),
}));

// loadEntityContext/loadUserTimezone are the two DB-touching calls
// runConversationTurn makes unconditionally -- mocked so these tests never
// hit a real Supabase instance. mutationSchema/toPendingMutation are kept
// REAL (via importOriginal): the "schema-invalid payload throws" test below
// specifically exercises their actual validation logic, not a stand-in.
vi.mock("@/lib/voice/intent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voice/intent")>();
  return {
    ...actual,
    loadEntityContext: vi
      .fn()
      .mockResolvedValue({ courses: [], deadlines: [], tasks: [], todoLists: [], sessions: [], appointments: [], knowledgeSources: [], people: [] }),
    loadUserTimezone: vi.fn().mockResolvedValue("UTC"),
  };
});

import { loadDraftMutation } from "@/lib/voice/conversation-memory";
import { CANCEL_SCOPE_QUESTION, RECURRENCE_DAYS_QUESTION, RECURRENCE_QUESTION } from "@/lib/voice/deadline-recurrence-gate";
import { runSuggestionsLookup } from "@/lib/voice/suggestions-lookup";
import { runDeadlineProgressLookup } from "@/lib/voice/deadline-progress-lookup";
import { loadEntityContext, loadUserTimezone, mutationDraftSchema } from "@/lib/voice/intent";
import { runConversationTurn } from "../conversation-core";

const VALID_TARGET_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_PERSON_ID = "33333333-3333-4333-8333-333333333333";
const DEADLINE_ID = "44444444-4444-4444-8444-444444444444";
const fakeSupabase = {} as SupabaseClient<Database>;

interface FakeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

function toolCallResponse(calls: FakeToolCall[]) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        },
      },
    ],
  };
}

const validProposeMutationArgs = {
  confidence: 0.97,
  summary: "Delete the task",
  target_type: "task",
  operation: "delete",
  target_id: VALID_TARGET_ID,
  course_id: null,
  title: null,
  due_at: null,
  body: null,
  priority: null,
  reminder_lead_minutes: null,
  event: null,
  snooze_until: null,
};

describe("runConversationTurn", () => {
  beforeEach(() => {
    vi.mocked(loadSchedule).mockClear();
    vi.mocked(runDeadlineProgressLookup).mockClear();
  });

  it("returns a mutation_proposal when propose_mutation is called alone", async () => {
    mocks.chatCompletionsCreate.mockReset();
    mocks.chatCompletionsCreate.mockResolvedValueOnce(
      toolCallResponse([{ id: "call_1", name: "propose_mutation", arguments: validProposeMutationArgs }]),
    );

    const result = await runConversationTurn(fakeSupabase, "user-1", "delete my task", "conv-1");

    expect(result).toEqual({
      kind: "mutation_proposal",
      confidence: 0.97,
      summary: "Delete the task",
      mutation: { targetType: "task", operation: "delete", targetId: VALID_TARGET_ID },
      conversationId: "conv-1",
    });
    expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "today", expect.any(Date));
  });

  // Mirrors the existing respond_to_user-bundling guard: a finalizing tool
  // call (respond_to_user OR propose_mutation) bundled with another tool
  // call in the same batch means the model committed to a final action
  // before seeing that other tool's result -- reject it and let the loop
  // continue once that result is in hand.
  it("rejects propose_mutation bundled with another tool call in the same batch, then continues once the data call resolves", async () => {
    mocks.chatCompletionsCreate.mockReset();
    mocks.chatCompletionsCreate
      .mockResolvedValueOnce(
        toolCallResponse([
          { id: "call_1", name: "get_schedule", arguments: { window: "date", date: "2026-09-05" } },
          { id: "call_2", name: "propose_mutation", arguments: validProposeMutationArgs },
        ]),
      )
      .mockResolvedValueOnce(toolCallResponse([{ id: "call_3", name: "respond_to_user", arguments: { message: "Done", needs_follow_up: false } }]));

    const result = await runConversationTurn(fakeSupabase, "user-1", "what's due, and delete my task", "conv-1");

    expect(result).toEqual({
      kind: "answer",
      message: "Done",
      needsFollowUp: false,
      conversationId: "conv-1",
    });
    expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(2);
    // 1 unconditional prefetch in setup + 1 real model-issued get_schedule
    // (window "date") call in the batch above -- the deliberate
    // graceful-fallback path, not a hard rejection, so it still dispatches
    // and costs a real DB round-trip.
    expect(loadSchedule).toHaveBeenCalledTimes(2);
  });

  it("throws when propose_mutation's arguments keep failing mutationSchema validation (never invents an id past a bad one)", async () => {
    mocks.chatCompletionsCreate.mockReset();
    mocks.chatCompletionsCreate.mockResolvedValue(
      toolCallResponse([{ id: "call_1", name: "propose_mutation", arguments: { ...validProposeMutationArgs, target_id: "not-a-uuid" } }]),
    );

    await expect(runConversationTurn(fakeSupabase, "user-1", "delete my task", "conv-1")).rejects.toThrow();
    // One recovery attempt (see the test below), then the original error surfaces.
    expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(2);
  });

  // Production incident (2026-09-21): "add a deadline for PHYS 6540 tomorrow at 8" -- the model
  // proposed a deadline create it couldn't fully fill in (no title), the schema rejected it, and the
  // whole turn collapsed into the generic "Sorry, I had trouble processing that" with nothing kept, so
  // the user had to start over. A proposal missing required fields must instead go back to the model as
  // a recoverable tool error, so it can save what it knows as a draft and ask for exactly what's missing.
  describe("a propose_mutation missing required fields", () => {
    const incompleteDeadlineArgs = {
      ...validProposeMutationArgs,
      summary: "Create a deadline",
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_TARGET_ID,
      title: null,
      due_at: "2026-09-22T20:00:00-04:00",
    };

    it("is fed back to the model as a tool error and the turn continues, rather than failing the whole turn", async () => {
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "propose_mutation", arguments: incompleteDeadlineArgs }]))
        .mockResolvedValueOnce(
          toolCallResponse([
            {
              id: "call_2",
              name: "save_mutation_draft",
              arguments: { ...incompleteDeadlineArgs, question: "What should I call the deadline?" },
            },
          ]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "add a deadline for physics tomorrow at 8", "conv-1");

      expect(result).toMatchObject({
        kind: "answer",
        message: "What should I call the deadline?",
        needsFollowUp: true,
        conversationId: "conv-1",
        draftMutation: { question: "What should I call the deadline?" },
      });
      expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(2);

      const secondCallMessages = mocks.chatCompletionsCreate.mock.calls[1][0].messages as Array<{ role: string; tool_call_id?: string; content: string }>;
      const toolError = secondCallMessages.find((message) => message.role === "tool" && message.tool_call_id === "call_1");
      expect(toolError).toBeDefined();
      expect(toolError!.content).toMatch(/save_mutation_draft/);
      expect(toolError!.content).toMatch(/title/);
    });

    it("can still be completed on the recovery turn by a propose_mutation that now has every field", async () => {
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "propose_mutation", arguments: incompleteDeadlineArgs }]))
        .mockResolvedValueOnce(
          toolCallResponse([
            { id: "call_2", name: "propose_mutation", arguments: { ...incompleteDeadlineArgs, title: "Homework six", recurring: false } },
          ]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "add a deadline for physics tomorrow at 8", "conv-1");

      expect(result.kind).toBe("mutation_proposal");
    });
  });

  it("prefetches today's schedule unconditionally and answers a 'today' question in a single model call", async () => {
    mocks.chatCompletionsCreate.mockReset();
    vi.mocked(loadSchedule).mockResolvedValueOnce({
      scheduleItems: [],
      overdueItems: [],
      rankedSchedule: [{ date: "2026-09-03", items: [{ kind: "task", id: "t1", title: "Submit form", priority: "High", context: null }] }],
      courses: [],
    });
    mocks.chatCompletionsCreate.mockResolvedValueOnce(
      toolCallResponse([{ id: "call_1", name: "respond_to_user", arguments: { message: "Submit form is due today.", needs_follow_up: false } }]),
    );

    const result = await runConversationTurn(fakeSupabase, "user-1", "what's due today?", "conv-1");

    expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "today", expect.any(Date));
    const [firstCallArgs] = mocks.chatCompletionsCreate.mock.calls[0];
    expect(firstCallArgs.messages[0].content).toContain("Submit form");
    expect(firstCallArgs.messages[0].content).toContain("never call get_schedule for today again");
    // Regression guard for a real observed hallucination: the model carried
    // a recurring class forward from an earlier turn's answer into a day it
    // didn't actually meet on. Just asserts the guarding instruction is
    // present in the built prompt -- LLM behavior itself isn't unit-testable.
    expect(firstCallArgs.messages[0].content).toContain("never add an item that isn't actually present in the specific result");
    expect(result).toEqual({ kind: "answer", message: "Submit form is due today.", needsFollowUp: false, conversationId: "conv-1" });
    expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(firstCallArgs.reasoning_effort).toBe("low");
  });

  // Regression for the observed production bug: a model that repeats the
  // exact same no-op data-tool call turn after turn (get_personalization_
  // suggestions called 5x running on a query needing no tool at all) must
  // not be allowed to ride that out to MAX_TOOL_CALL_ITERATIONS -- the very
  // next completion after the repeat is caught should have tool_choice
  // forced to respond_to_user, and the repeated call itself must not incur
  // a second real dispatch.
  it("forces respond_to_user on the call right after a repeated identical tool call, without re-dispatching it", async () => {
    mocks.chatCompletionsCreate.mockReset();
    mocks.chatCompletionsCreate
      .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "get_personalization_suggestions", arguments: {} }]))
      .mockResolvedValueOnce(toolCallResponse([{ id: "call_2", name: "get_personalization_suggestions", arguments: {} }]))
      .mockResolvedValueOnce(
        toolCallResponse([{ id: "call_3", name: "respond_to_user", arguments: { message: "You have 2 items due today.", needs_follow_up: false } }]),
      );

    const result = await runConversationTurn(fakeSupabase, "user-1", "what is due today?", "conv-1");

    expect(result).toEqual({
      kind: "answer",
      message: "You have 2 items due today.",
      needsFollowUp: false,
      usedPersonalizationSuggestions: true,
      conversationId: "conv-1",
    });
    expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(3);
    expect(runSuggestionsLookup).toHaveBeenCalledTimes(1);
    const [thirdCallArgs] = mocks.chatCompletionsCreate.mock.calls[2];
    expect(thirdCallArgs.tool_choice).toEqual({ type: "function", function: { name: "respond_to_user" } });
    for (const [callArgs] of mocks.chatCompletionsCreate.mock.calls) {
      expect(callArgs.reasoning_effort).toBe("low");
    }
  });

  describe("spoken-input handling", () => {
    async function systemPromptFor(courses: Array<{ id: string; code: string | null; name: string }>): Promise<string> {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses,
        deadlines: [],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate.mockResolvedValueOnce(
        toolCallResponse([{ id: "call_1", name: "respond_to_user", arguments: { message: "ok", needs_follow_up: false } }]),
      );
      await runConversationTurn(fakeSupabase, "user-1", "hello", "conv-1");
      return mocks.chatCompletionsCreate.mock.calls[0][0].messages[0].content as string;
    }

    // The live model once resolved "Friday" to Thursday the 24th from a bare ISO timestamp -- weekday
    // arithmetic is not something to leave to it, so the prompt carries an explicit local calendar.
    it("spells out today's weekday and the next two weeks of weekday-to-date pairs in the user's timezone", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-22T02:37:00Z")); // 10:37 PM Monday in New York
      try {
        vi.mocked(loadUserTimezone).mockResolvedValueOnce("America/New_York");
        const prompt = await systemPromptFor([]);
        expect(prompt).toContain("Monday, September 21, 2026");
        expect(prompt).toContain("Friday 2026-09-25");
        expect(prompt).toContain("Wednesday 2026-09-23");
        expect(prompt).toContain("Sunday 2026-10-04");
        expect(prompt).not.toContain("2026-10-05");
      } finally {
        vi.useRealTimers();
      }
    });

    // A live check saw a bare "Okay" fire get_personalization_suggestions (a paid call that also starts the
    // client's review-aloud flow) -- withheld deterministically, since the prompt nudge alone wasn't reliable.
    it.each([
      ["Okay", false],
      ["Yeah, okay", false],
      ["Okay, what do my suggestions say?", true],
      ["What's due tomorrow?", true],
    ])("offers the suggestions tool for %j only when it isn't a bare acknowledgement (%s)", async (transcript, offered) => {
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate.mockResolvedValueOnce(
        toolCallResponse([{ id: "call_1", name: "respond_to_user", arguments: { message: "ok", needs_follow_up: false } }]),
      );
      await runConversationTurn(fakeSupabase, "user-1", transcript, "conv-1");
      const tools = mocks.chatCompletionsCreate.mock.calls[0][0].tools as Array<{ function: { name: string } }>;
      const names = tools.map((tool) => tool.function.name);
      expect(names.includes("get_personalization_suggestions")).toBe(offered);
      expect(names).toContain("respond_to_user");
      expect(names).toContain("propose_mutation");
    });

    it("gives the model each course's code, so a spoken 'P H Y S six five four zero' can be matched to a real course id", async () => {
      const prompt = await systemPromptFor([{ id: VALID_TARGET_ID, code: "PHYS 6540", name: "Structure, Defects and Diffusion" }]);
      expect(prompt).toContain('"code":"PHYS 6540"');
    });

    it("tells the model how to treat hesitations, pauses, self-corrections, and spelled-out codes in speech", async () => {
      const prompt = await systemPromptFor([]);
      expect(prompt).toMatch(/Spoken input/i);
      expect(prompt).toMatch(/um|uh|hmm/i);
      expect(prompt).toMatch(/self-correct|changes? (?:their|his|her) mind|corrects? themselves/i);
      expect(prompt).toMatch(/spelled|letter by letter/i);
      // Noise or a bare acknowledgement must never fire a data tool (a live check saw "Okay" trigger
      // get_personalization_suggestions, which also kicks off the client's review-aloud flow).
      expect(prompt).toMatch(/never a reason to call any (?:data )?tool/i);
      // A Deadline create's required fields route through a draft, never a silent failure.
      expect(prompt).toMatch(/Deadline create[^.]*course[^.]*title[^.]*save_mutation_draft/i);
    });
  });

  describe("get_person_schedule", () => {
    it("resolves a person_id present in the entity context and calls loadSchedule scoped to that person", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [{ id: PERSON_ID, name: "Châu", relationship: "sister" }],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_1", name: "get_person_schedule", arguments: { person_id: PERSON_ID, window: "date", date: "2026-09-03" } }]),
        )
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "Châu is free until 3pm.", needs_follow_up: false } }]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "what is my sister's schedule today?", "conv-1");

      expect(result).toEqual({
        kind: "answer",
        message: "Châu is free until 3pm.",
        needsFollowUp: false,
        conversationId: "conv-1",
      });
      // 1 unconditional "today" prefetch (personId omitted -- the owner's own
      // schedule) + 1 real get_person_schedule dispatch scoped to PERSON_ID.
      expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "today", expect.any(Date));
      expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "date", expect.any(Date), PERSON_ID, "2026-09-03");
      expect(mocks.chatCompletionsCreate.mock.calls[0][0].reasoning_effort).toBe("low");
      expect(mocks.chatCompletionsCreate.mock.calls[1][0].reasoning_effort).toBe("low");
    });

    it("still resolves correctly for a person with no relationship set (relationship: null)", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [{ id: PERSON_ID, name: "Châu", relationship: null }],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_1", name: "get_person_schedule", arguments: { person_id: PERSON_ID, window: "date", date: "2026-09-03" } }]),
        )
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "Châu is free.", needs_follow_up: false } }]));

      const result = await runConversationTurn(fakeSupabase, "user-1", "is Châu free today?", "conv-1");

      expect(result).toEqual({ kind: "answer", message: "Châu is free.", needsFollowUp: false, conversationId: "conv-1" });
      expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "date", expect.any(Date), PERSON_ID, "2026-09-03");
    });

    // The concrete regression test for "never let the model invent a
    // person_id": a person_id absent from this turn's own entity context
    // must be rejected before ever reaching loadSchedule, regardless of how
    // the model came up with it.
    it("rejects a person_id that is not in the entity context, without calling loadSchedule for it", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [{ id: PERSON_ID, name: "Châu", relationship: "sister" }],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(
          toolCallResponse([
            { id: "call_1", name: "get_person_schedule", arguments: { person_id: UNKNOWN_PERSON_ID, window: "date", date: "2026-09-03" } },
          ]),
        )
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "I don't have anyone tracked under that name.", needs_follow_up: false } }]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "what is my brother's schedule?", "conv-1");

      expect(result).toEqual({
        kind: "answer",
        message: "I don't have anyone tracked under that name.",
        needsFollowUp: false,
        conversationId: "conv-1",
      });
      expect(loadSchedule).not.toHaveBeenCalledWith(fakeSupabase, "user-1", "date", expect.any(Date), UNKNOWN_PERSON_ID, "2026-09-03");
      // messages is the same array reference the mock recorded, mutated
      // further after this call (the respond_to_user assistant message gets
      // appended on the next iteration) -- at(-2) is this call's own tool
      // result, at(-1) would be that later, unrelated assistant message.
      expect(mocks.chatCompletionsCreate.mock.calls[1][0].messages.at(-2).content).toContain("Unknown person_id");
    });
  });

  describe("get_deadline_progress", () => {
    it("resolves a deadline_id present in the entity context and relays the lookup's message", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [{ id: DEADLINE_ID, title: "Homework 1", course_id: "course-1", due_at: "2026-09-25T22:00:00.000Z", status: "Not Started" as const, recurring: false }],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "get_deadline_progress", arguments: { deadline_id: DEADLINE_ID } }]))
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "2 of 3 sessions done.", needs_follow_up: false } }]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "how much progress on Homework 1?", "conv-1");

      expect(result).toEqual({ kind: "answer", message: "2 of 3 sessions done.", needsFollowUp: false, conversationId: "conv-1" });
      expect(runDeadlineProgressLookup).toHaveBeenCalledWith(fakeSupabase, "user-1", DEADLINE_ID);
    });

    // Regression test: a manual QA session asked "when is my final project
    // report due?" and the model called get_deadline_progress with a
    // deadline_id that wasn't even UUID-shaped -- schema.parse's ZodError
    // propagated straight out of runConversationTurn, uncaught, aborting the
    // whole turn into session.ts's generic "Sorry, I had trouble processing
    // that" fallback instead of letting the model retry. A malformed
    // deadline_id must be recoverable the same way an unknown-but-well-formed
    // one already is (the test above / the person_id equivalent above it),
    // never a hard turn failure.
    it("feeds a malformed (non-UUID) deadline_id back to the model as a tool error instead of crashing the turn", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [{ id: DEADLINE_ID, title: "Homework 1", course_id: "course-1", due_at: "2026-09-25T22:00:00.000Z", status: "Not Started" as const, recurring: false }],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "get_deadline_progress", arguments: { deadline_id: "final-project-report" } }]))
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "I don't have a matching deadline.", needs_follow_up: false } }]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "when is my final project report due?", "conv-1");

      expect(result).toEqual({ kind: "answer", message: "I don't have a matching deadline.", needsFollowUp: false, conversationId: "conv-1" });
      expect(runDeadlineProgressLookup).not.toHaveBeenCalled();
      expect(mocks.chatCompletionsCreate.mock.calls[1][0].messages.at(-2).content).toContain("received invalid arguments");
    });

    it("rejects a deadline_id that is not in the entity context, without calling the lookup for it", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [{ id: DEADLINE_ID, title: "Homework 1", course_id: "course-1", due_at: "2026-09-25T22:00:00.000Z", status: "Not Started" as const, recurring: false }],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_1", name: "get_deadline_progress", arguments: { deadline_id: "55555555-5555-4555-8555-555555555555" } }]),
        )
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "I don't have a matching deadline.", needs_follow_up: false } }]),
        );

      const result = await runConversationTurn(fakeSupabase, "user-1", "how much progress on the thesis?", "conv-1");

      expect(result).toEqual({ kind: "answer", message: "I don't have a matching deadline.", needsFollowUp: false, conversationId: "conv-1" });
      expect(runDeadlineProgressLookup).not.toHaveBeenCalled();
      expect(mocks.chatCompletionsCreate.mock.calls[1][0].messages.at(-2).content).toContain("Unknown deadline_id");
    });
  });

  describe("recurring deadlines (voice)", () => {
    const COURSE_ID = "55555555-5555-4555-8555-555555555555";
    const deadlineCreateArgs = {
      confidence: 0.97,
      summary: "Create a deadline 'Weekly quiz'",
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: COURSE_ID,
      title: "Weekly quiz",
      due_at: "2026-09-25T22:00:00.000Z",
      priority: null,
      reminder_lead_minutes: null,
      event: null,
      snooze_until: null,
    };

    beforeEach(() => {
      mocks.chatCompletionsCreate.mockReset();
      vi.mocked(loadDraftMutation).mockReset();
      vi.mocked(loadDraftMutation).mockResolvedValue(null);
    });

    it("asks whether a new deadline should repeat instead of proposing it when the user said nothing about it", async () => {
      mocks.chatCompletionsCreate.mockResolvedValueOnce(toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: deadlineCreateArgs }]));

      const result = await runConversationTurn(fakeSupabase, "user-1", "add a weekly quiz for CS 101 friday at 5", "conv-1");

      expect(result).toMatchObject({
        kind: "answer",
        message: RECURRENCE_QUESTION,
        needsFollowUp: true,
        draftMutation: { question: RECURRENCE_QUESTION, mutation: { target_type: "deadline", title: "Weekly quiz", recurring: null } },
      });
    });

    it("proposes a one-off deadline once the repeat question has been asked and the answer was no", async () => {
      vi.mocked(loadDraftMutation).mockResolvedValue({ question: RECURRENCE_QUESTION, mutation: mutationDraftSchema.parse(deadlineCreateArgs) });
      mocks.chatCompletionsCreate.mockResolvedValueOnce(
        toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: { ...deadlineCreateArgs, recurring: false } }]),
      );

      const result = await runConversationTurn(fakeSupabase, "user-1", "no", "conv-1");

      expect(result).toMatchObject({ kind: "mutation_proposal", mutation: { targetType: "deadline", operation: "create" } });
      expect((result as { mutation: { payload: object } }).mutation.payload).not.toHaveProperty("recurrence_days");
    });

    it("defaults to one-off when the answer to the repeat question still doesn't say (no by default)", async () => {
      vi.mocked(loadDraftMutation).mockResolvedValue({ question: RECURRENCE_QUESTION, mutation: mutationDraftSchema.parse(deadlineCreateArgs) });
      mocks.chatCompletionsCreate.mockResolvedValueOnce(toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: deadlineCreateArgs }]));

      const result = await runConversationTurn(fakeSupabase, "user-1", "hmm", "conv-1");

      expect(result.kind).toBe("mutation_proposal");
    });

    it("proposes straight away, with the resolved schedule, when the user already said it repeats", async () => {
      mocks.chatCompletionsCreate.mockResolvedValueOnce(
        toolCallResponse([
          {
            id: "c1",
            name: "propose_mutation",
            arguments: { ...deadlineCreateArgs, recurring: true, recurrence_days: [3, 1], recurrence_end_date: "2026-12-11" },
          },
        ]),
      );

      const result = await runConversationTurn(fakeSupabase, "user-1", "add a quiz every monday and wednesday until dec 11", "conv-1");

      expect(result).toMatchObject({
        kind: "mutation_proposal",
        mutation: {
          targetType: "deadline",
          operation: "create",
          payload: { recurrence_days: [1, 3], recurrence_end_date: "2026-12-11" },
        },
      });
    });

    it("asks which days when the user says it repeats but names none", async () => {
      mocks.chatCompletionsCreate.mockResolvedValueOnce(
        toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: { ...deadlineCreateArgs, recurring: true, recurrence_days: [] } }]),
      );

      const result = await runConversationTurn(fakeSupabase, "user-1", "yes", "conv-1");

      expect(result).toMatchObject({ kind: "answer", message: RECURRENCE_DAYS_QUESTION, needsFollowUp: true });
    });
  });

  describe("cancelling a repeating deadline (voice)", () => {
    const REPEATING_ID = "66666666-6666-4666-8666-666666666666";
    const cancelArgs = {
      confidence: 0.97,
      summary: "Cancel the weekly quiz",
      target_type: "deadline",
      operation: "transition",
      target_id: REPEATING_ID,
      course_id: null,
      title: null,
      due_at: null,
      priority: null,
      reminder_lead_minutes: null,
      event: "user_cancels",
      snooze_until: null,
    };

    beforeEach(() => {
      mocks.chatCompletionsCreate.mockReset();
      vi.mocked(loadDraftMutation).mockReset();
      vi.mocked(loadDraftMutation).mockResolvedValue(null);
      vi.mocked(loadEntityContext).mockResolvedValue({
        courses: [],
        deadlines: [{ id: REPEATING_ID, title: "Weekly quiz", course_id: "course-1", due_at: "2026-09-21T22:00:00.000Z", status: "Not Started", recurring: true }],
        tasks: [],
        todoLists: [],
        sessions: [],
        appointments: [],
        knowledgeSources: [],
        people: [],
      });
    });

    it("asks whether to cancel this occurrence or the whole series instead of proposing", async () => {
      mocks.chatCompletionsCreate.mockResolvedValueOnce(toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: cancelArgs }]));

      const result = await runConversationTurn(fakeSupabase, "user-1", "cancel my weekly quiz", "conv-1");

      expect(result).toMatchObject({ kind: "answer", message: CANCEL_SCOPE_QUESTION, needsFollowUp: true, draftMutation: { question: CANCEL_SCOPE_QUESTION } });
    });

    it("proposes a whole-series cancel once the user chose it", async () => {
      mocks.chatCompletionsCreate.mockResolvedValueOnce(
        toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: { ...cancelArgs, cancel_scope: "series" } }]),
      );

      const result = await runConversationTurn(fakeSupabase, "user-1", "the whole series", "conv-1");

      expect(result).toMatchObject({
        kind: "mutation_proposal",
        mutation: { targetType: "deadline", operation: "transition", targetId: REPEATING_ID, event: "user_cancels", cancelScope: "series" },
      });
    });

    it("falls back to just this occurrence when the question was asked and the answer stays unclear", async () => {
      vi.mocked(loadDraftMutation).mockResolvedValue({ question: CANCEL_SCOPE_QUESTION, mutation: mutationDraftSchema.parse(cancelArgs) });
      mocks.chatCompletionsCreate.mockResolvedValueOnce(toolCallResponse([{ id: "c1", name: "propose_mutation", arguments: cancelArgs }]));

      const result = await runConversationTurn(fakeSupabase, "user-1", "uh", "conv-1");

      expect(result).toMatchObject({ kind: "mutation_proposal", mutation: { cancelScope: "occurrence" } });
    });
  });
});
