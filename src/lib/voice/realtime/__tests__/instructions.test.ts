import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon" }, requireEnv: (name: string) => `fake-${name}` }));

const { buildRealtimeInstructions, REALTIME_ADAPTATION } = await import("../instructions");
const { CONVERSATION_SYSTEM_PROMPT } = await import("@/lib/voice/conversation-core");

const context = { courses: [], deadlines: [], tasks: [], todoLists: [], sessions: [], appointments: [], knowledgeSources: [], people: [] };
const base = {
  now: new Date("2026-11-03T15:07:42.000Z"),
  timezone: "America/New_York",
  context,
  todaySchedule: { overdueItems: [], rankedSchedule: [] },
  draft: null,
  history: [],
};

describe("buildRealtimeInstructions", () => {
  it("puts the call overrides first, then the shipped prompt unchanged, then the turn context", () => {
    const text = buildRealtimeInstructions(base as never);
    const adaptation = text.indexOf(REALTIME_ADAPTATION);
    const prompt = text.indexOf(CONVERSATION_SYSTEM_PROMPT);
    const turnContext = text.indexOf("Current time:");
    expect(adaptation).toBe(0);
    expect(prompt).toBeGreaterThan(adaptation);
    expect(turnContext).toBeGreaterThan(prompt);
  });

  it("includes the shipped prompt byte-for-byte, so the push-to-talk and call rules cannot fork", () => {
    expect(buildRealtimeInstructions(base as never)).toContain(CONVERSATION_SYSTEM_PROMPT);
  });

  it("embeds the user's clock in their timezone and their entity data", () => {
    const text = buildRealtimeInstructions({ ...base, context: { ...context, people: [{ id: "p-1", name: "Châu", relationship: "sister" }] } } as never);
    expect(text).toContain("America/New_York");
    expect(text).toContain("2026-11-03T15:07:00.000Z"); // rounded to the minute
    expect(text).toContain("Châu");
  });

  it("tells the model what replaces respond_to_user and how confirmation works", () => {
    expect(REALTIME_ADAPTATION).toMatch(/NO respond_to_user tool/);
    expect(REALTIME_ADAPTATION).toMatch(/confirm_pending_mutation/);
    expect(REALTIME_ADAPTATION).toMatch(/never confirm on your own/i);
    expect(REALTIME_ADAPTATION).toMatch(/end_call/);
  });

  it("says a no or yes answering a clarifying question is an answer, not a decline or confirm", () => {
    expect(REALTIME_ADAPTATION).toMatch(/only apply to the yes-or-no you asked after reading back a proposal/i);
    expect(REALTIME_ADAPTATION).toMatch(/does it repeat|clarifying question/i);
    expect(REALTIME_ADAPTATION).toMatch(/never call confirm_pending_mutation or decline_pending_mutation when no propose_mutation result is awaiting confirmation/i);
  });

  it("forbids substituting the only tracked person for a name that isn't on the list", () => {
    expect(REALTIME_ADAPTATION).toMatch(/not in the "people" list, say you don't have anyone tracked by that name/);
    expect(REALTIME_ADAPTATION).toMatch(/even when the list holds only one person, never substitute/);
  });

  it("includes only the most recent turns of earlier conversation, labelled as history", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `turn ${i}` }));
    const text = buildRealtimeInstructions({ ...base, history } as never);
    expect(text).toContain("turn 11");
    expect(text).toContain("turn 4");
    expect(text).not.toContain("turn 3\n");
    expect(text).toMatch(/before this call began/);
  });

  it("adds no history section for a brand-new conversation", () => {
    expect(buildRealtimeInstructions(base as never)).not.toMatch(/before this call began/);
  });

  it("carries an open draft through, as a press-to-talk turn does", () => {
    const draft = { mutation: { targetType: "event", operation: "create", title: "Dentist" }, question: "What time?" };
    const text = buildRealtimeInstructions({ ...base, draft } as never);
    expect(text).toContain("What time?");
    expect(text).toContain("Dentist");
  });
});
