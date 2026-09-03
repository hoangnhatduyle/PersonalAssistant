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

// loadEntityContext/loadUserTimezone are the two DB-touching calls
// runConversationTurn makes unconditionally -- mocked so these tests never
// hit a real Supabase instance. mutationSchema/toPendingMutation are kept
// REAL (via importOriginal): the "schema-invalid payload throws" test below
// specifically exercises their actual validation logic, not a stand-in.
vi.mock("@/lib/voice/intent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voice/intent")>();
  return {
    ...actual,
    loadEntityContext: vi.fn().mockResolvedValue({ courses: [], deadlines: [], tasks: [], knowledgeSources: [] }),
    loadUserTimezone: vi.fn().mockResolvedValue("UTC"),
  };
});

import { runConversationTurn } from "../conversation-core";

const VALID_TARGET_ID = "11111111-1111-4111-8111-111111111111";
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
});
