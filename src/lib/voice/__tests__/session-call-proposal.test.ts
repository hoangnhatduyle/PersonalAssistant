import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Keep this test hermetic: no real env, no cascade lookup, no conversation table.
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon" }, requireEnv: (name: string) => `fake-${name}` }));

const mocks = vi.hoisted(() => ({
  setQueuedSteps: vi.fn(),
  previewCourseDeleteCascade: vi.fn(),
}));
vi.mock("@/lib/voice/conversation-memory", () => ({
  setQueuedSteps: mocks.setQueuedSteps,
  loadQueuedSteps: vi.fn().mockResolvedValue([]),
  resolveActiveConversation: vi.fn(),
  setDraftMutation: vi.fn(),
}));
vi.mock("@/lib/voice/cascade-preview", () => ({
  previewCourseDeleteCascade: mocks.previewCourseDeleteCascade,
  formatCascadeDisclosure: () => "That will also delete 3 deadlines.",
}));

const { proposeMutationForCall } = await import("../session");

/**
 * A one-table stand-in for voice_sessions that enforces what transition()
 * relies on: an UPDATE only lands when the row is still in the state the caller
 * names (`.eq("state", fromState)`). So a wrong event order in the code under
 * test fails here exactly as it would against Postgres.
 */
function fakeVoiceSessions() {
  const row: Record<string, unknown> = { id: "sess-1", state: "Idle" };
  const updates: Array<Record<string, unknown>> = [];
  let inserted: Record<string, unknown> | null = null;

  const client = {
    from: (table: string) => {
      if (table !== "voice_sessions") throw new Error(`unexpected table ${table}`);
      return {
        insert: (values: Record<string, unknown>) => {
          inserted = values;
          return { select: () => ({ single: async () => ({ data: { id: row.id, state: row.state }, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            select: () => chain,
            maybeSingle: async () => {
              if (filters.state !== row.state) return { data: null, error: null };
              Object.assign(row, patch);
              updates.push(patch);
              return { data: { id: row.id }, error: null };
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  return { client, row, updates, getInserted: () => inserted };
}

const proposal = (overrides: Record<string, unknown> = {}) =>
  ({
    kind: "mutation_proposal" as const,
    confidence: 0.97,
    summary: "Delete the task Pay rent",
    mutation: { targetType: "task" as const, operation: "delete" as const, targetId: "11111111-1111-4111-8111-111111111111" },
    conversationId: "conv-1",
    queuedSteps: [],
    ...overrides,
  }) as Parameters<typeof proposeMutationForCall>[2];

describe("proposeMutationForCall", () => {
  beforeEach(() => {
    mocks.setQueuedSteps.mockReset();
    mocks.previewCourseDeleteCascade.mockReset();
  });

  it("below the confidence bar it records nothing and asks the caller to have the user rephrase", async () => {
    const db = fakeVoiceSessions();
    const result = await proposeMutationForCall(db.client, "user-1", proposal({ confidence: 0.6 }), "delete my thing");
    expect(result).toEqual({ status: "needs_rephrase", summary: "Delete the task Pay rent" });
    expect(db.getInserted()).toBeNull();
    expect(db.updates).toEqual([]);
    expect(mocks.setQueuedSteps).not.toHaveBeenCalled();
  });

  it("walks a fresh session to AwaitingConfirmation, storing the pending mutation, conversation and pre-arm expiry", async () => {
    const db = fakeVoiceSessions();
    const result = await proposeMutationForCall(db.client, "user-1", proposal(), "delete my rent task");

    expect(result).toEqual({ status: "awaiting_confirmation", sessionId: "sess-1", message: "Delete the task Pay rent" });
    expect(db.getInserted()).toEqual({ user_id: "user-1" });
    expect(db.row.state).toBe("AwaitingConfirmation");
    expect(db.updates.map((u) => u.state)).toEqual(["Listening", "Transcribing", "IntentResolved", "AwaitingConfirmation"]);
    expect(db.updates[1]).toMatchObject({ transcript: "delete my rent task" });
    expect(db.updates[2]).toMatchObject({ resolved_intent: "Delete the task Pay rent", confidence_score: 0.97 });
    expect(db.updates[3]).toMatchObject({
      pending_mutation: { targetType: "task", operation: "delete", targetId: "11111111-1111-4111-8111-111111111111" },
      conversation_id: "conv-1",
    });
    expect(typeof db.updates[3].expires_at).toBe("string");
    expect(new Date(db.updates[3].expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("labels the transcript when the call produced none", async () => {
    const db = fakeVoiceSessions();
    await proposeMutationForCall(db.client, "user-1", proposal(), null);
    expect(db.updates[1]).toMatchObject({ transcript: "(voice call)" });
  });

  it("discloses a course delete's cascade in the message, before the user confirms", async () => {
    mocks.previewCourseDeleteCascade.mockResolvedValue({});
    const db = fakeVoiceSessions();
    const result = await proposeMutationForCall(
      db.client,
      "user-1",
      proposal({ summary: "Delete the course Algorithms", mutation: { targetType: "course", operation: "delete", targetId: "22222222-2222-4222-8222-222222222222" } }),
      "delete algorithms",
    );
    expect(mocks.previewCourseDeleteCascade).toHaveBeenCalledWith(db.client, "user-1", "22222222-2222-4222-8222-222222222222");
    expect(result).toMatchObject({ status: "awaiting_confirmation", message: "Delete the course Algorithms That will also delete 3 deadlines." });
  });

  it("queues additional steps for the conversation, and clears the queue when there are none", async () => {
    const step = { mutation: { targetType: "task", operation: "delete", targetId: "33333333-3333-4333-8333-333333333333" }, summary: "Delete the other task" };
    await proposeMutationForCall(fakeVoiceSessions().client, "user-1", proposal({ queuedSteps: [step] }), "x");
    expect(mocks.setQueuedSteps).toHaveBeenLastCalledWith(expect.anything(), "user-1", "conv-1", [step]);

    await proposeMutationForCall(fakeVoiceSessions().client, "user-1", proposal({ queuedSteps: [] }), "x");
    expect(mocks.setQueuedSteps).toHaveBeenLastCalledWith(expect.anything(), "user-1", "conv-1", null);
  });
});
