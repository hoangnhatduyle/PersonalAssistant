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
}));

vi.mock("@/lib/voice/schedule-loader", () => ({
  loadSchedule: vi.fn().mockResolvedValue({ rankedSchedule: [], courses: [] }),
  toScheduleToolPayload: (result: { rankedSchedule: unknown; courses: unknown }) => ({
    rankedSchedule: result.rankedSchedule,
    courses: result.courses,
  }),
}));

vi.mock("@/lib/voice/suggestions-lookup", () => ({
  runSuggestionsLookup: vi.fn().mockResolvedValue({ message: "No new suggestions right now." }),
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
    loadEntityContext: vi.fn().mockResolvedValue({ courses: [], deadlines: [], tasks: [], knowledgeSources: [], people: [] }),
    loadUserTimezone: vi.fn().mockResolvedValue("UTC"),
  };
});

import { runSuggestionsLookup } from "@/lib/voice/suggestions-lookup";
import { loadEntityContext } from "@/lib/voice/intent";
import { runConversationTurn } from "../conversation-core";

const VALID_TARGET_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_PERSON_ID = "33333333-3333-4333-8333-333333333333";
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
          { id: "call_1", name: "get_schedule", arguments: { window: "today" } },
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
    // 1 unconditional prefetch in setup + 1 real model-issued get_schedule("today")
    // call in the batch above -- the deliberate graceful-fallback path, not a
    // hard rejection, so it still dispatches and costs a real DB round-trip.
    expect(loadSchedule).toHaveBeenCalledTimes(2);
  });

  it("throws when propose_mutation's arguments fail mutationSchema validation (never invents an id past a bad one)", async () => {
    mocks.chatCompletionsCreate.mockReset();
    mocks.chatCompletionsCreate.mockResolvedValueOnce(
      toolCallResponse([{ id: "call_1", name: "propose_mutation", arguments: { ...validProposeMutationArgs, target_id: "not-a-uuid" } }]),
    );

    await expect(runConversationTurn(fakeSupabase, "user-1", "delete my task", "conv-1")).rejects.toThrow();
  });

  it("prefetches today's schedule unconditionally and answers a 'today' question in a single model call", async () => {
    mocks.chatCompletionsCreate.mockReset();
    vi.mocked(loadSchedule).mockResolvedValueOnce({
      scheduleItems: [],
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
    expect(firstCallArgs.messages[0].content).toContain('do not call get_schedule with window: "today"');
    expect(result).toEqual({ kind: "answer", message: "Submit form is due today.", needsFollowUp: false, conversationId: "conv-1" });
    expect(mocks.chatCompletionsCreate).toHaveBeenCalledTimes(1);
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
  });

  describe("get_person_schedule", () => {
    it("resolves a person_id present in the entity context and calls loadSchedule scoped to that person", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [],
        tasks: [],
        knowledgeSources: [],
        people: [{ id: PERSON_ID, name: "Châu", relationship: "sister" }],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "get_person_schedule", arguments: { person_id: PERSON_ID, window: "today" } }]))
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
      expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "today", undefined, PERSON_ID);
    });

    it("still resolves correctly for a person with no relationship set (relationship: null)", async () => {
      vi.mocked(loadEntityContext).mockResolvedValueOnce({
        courses: [],
        deadlines: [],
        tasks: [],
        knowledgeSources: [],
        people: [{ id: PERSON_ID, name: "Châu", relationship: null }],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_1", name: "get_person_schedule", arguments: { person_id: PERSON_ID, window: "today" } }]))
        .mockResolvedValueOnce(toolCallResponse([{ id: "call_2", name: "respond_to_user", arguments: { message: "Châu is free.", needs_follow_up: false } }]));

      const result = await runConversationTurn(fakeSupabase, "user-1", "is Châu free today?", "conv-1");

      expect(result).toEqual({ kind: "answer", message: "Châu is free.", needsFollowUp: false, conversationId: "conv-1" });
      expect(loadSchedule).toHaveBeenCalledWith(fakeSupabase, "user-1", "today", undefined, PERSON_ID);
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
        knowledgeSources: [],
        people: [{ id: PERSON_ID, name: "Châu", relationship: "sister" }],
      });
      mocks.chatCompletionsCreate.mockReset();
      mocks.chatCompletionsCreate
        .mockResolvedValueOnce(
          toolCallResponse([{ id: "call_1", name: "get_person_schedule", arguments: { person_id: UNKNOWN_PERSON_ID, window: "today" } }]),
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
      expect(loadSchedule).not.toHaveBeenCalledWith(fakeSupabase, "user-1", "today", undefined, UNKNOWN_PERSON_ID);
      // messages is the same array reference the mock recorded, mutated
      // further after this call (the respond_to_user assistant message gets
      // appended on the next iteration) -- at(-2) is this call's own tool
      // result, at(-1) would be that later, unrelated assistant message.
      expect(mocks.chatCompletionsCreate.mock.calls[1][0].messages.at(-2).content).toContain("Unknown person_id");
    });
  });
});
