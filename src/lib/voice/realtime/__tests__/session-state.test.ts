import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon" }, requireEnv: (name: string) => `fake-${name}` }));

const loaded = vi.hoisted(() => ({ persona: "butler" as string | null }));
vi.mock("@/lib/voice/conversation-memory", () => ({
  resolveActiveConversation: async () => ({ conversationId: "c-1" }),
  loadDraftMutation: async () => null,
  loadConversationHistory: async () => [],
}));
vi.mock("@/lib/voice/intent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voice/intent")>()),
  loadUserTimezone: async () => "UTC",
  loadEntityContext: async () => ({ courses: [], deadlines: [], tasks: [], todoLists: [], sessions: [], appointments: [], knowledgeSources: [], people: [] }),
}));
vi.mock("@/lib/voice/schedule-loader", () => ({
  loadSchedule: async () => ({}),
  toScheduleToolPayload: () => ({ overdueItems: [], rankedSchedule: [] }),
}));

const { buildCallInstructions } = await import("../session-state");
const { VOICE_PERSONAS } = await import("../personas");

const supabaseWithPersona = () =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: loaded.persona ? { voice_persona: loaded.persona } : null }) }) }) }),
  }) as never;

describe("buildCallInstructions", () => {
  it("uses the saved persona's voice and puts its tone in the instructions", async () => {
    loaded.persona = "butler";
    const { voice, instructions } = await buildCallInstructions(supabaseWithPersona(), "u-1");
    expect(voice).toBe(VOICE_PERSONAS.butler.voice);
    expect(instructions).toContain(VOICE_PERSONAS.butler.tone);
  });

  it("falls back to the classic voice, with no added tone, when the user has never saved a preference", async () => {
    loaded.persona = null;
    const { voice, instructions } = await buildCallInstructions(supabaseWithPersona(), "u-1");
    expect(voice).toBe(VOICE_PERSONAS.classic.voice);
    expect(instructions).not.toContain("SPEAKING STYLE");
  });
});
