import { REALTIME_DEFAULT_VOICE } from "@/lib/voice/realtime/constants";

/**
 * The voice presets a user can pick for the live call. Each pairs one built-in
 * Realtime voice with a short tone instruction, because the instruction shapes
 * phrasing and pacing at least as much as the voice shapes timbre. Users only
 * ever choose an id, so the browser can never send an arbitrary voice string
 * or prompt text.
 */
export const VOICE_PERSONA_IDS = ["classic", "butler", "coach", "calm", "direct"] as const;
export type VoicePersonaId = (typeof VOICE_PERSONA_IDS)[number];

export const DEFAULT_VOICE_PERSONA_ID: VoicePersonaId = "classic";

export interface VoicePersona {
  id: VoicePersonaId;
  label: string;
  description: string;
  /** A built-in Realtime voice name. */
  voice: string;
  /** Added to the call instructions; empty keeps the shipped assistant style untouched. */
  tone: string;
}

export const VOICE_PERSONAS: Record<VoicePersonaId, VoicePersona> = {
  classic: {
    id: "classic",
    label: "Classic",
    description: "Warm, clear and friendly. The default.",
    voice: REALTIME_DEFAULT_VOICE,
    tone: "",
  },
  butler: {
    id: "butler",
    label: "Butler",
    description: "Calm, formal and dry, with understated wit.",
    voice: "ash",
    tone: "Speak like a composed, impeccably polite personal butler: calm, formal, dry and understated, with the occasional light wit. Address the user as \"sir\" or \"ma'am\" only if they have told you which they prefer, otherwise avoid titles. Never gush or use exclamation marks.",
  },
  coach: {
    id: "coach",
    label: "Coach",
    description: "Upbeat and encouraging, with gentle nudges.",
    voice: "coral",
    tone: "Speak like an upbeat, encouraging coach: positive energy, brief praise for progress, and a gentle nudge when a deadline is close. Stay sincere and keep it short; never lecture.",
  },
  calm: {
    id: "calm",
    label: "Calm",
    description: "Soft, slow and unhurried. Good for evenings.",
    voice: "sage",
    tone: "Speak softly, slowly and unhurriedly in a reassuring, soothing tone. Use gentle, simple phrasing and leave room to breathe between thoughts; never sound rushed or urgent.",
  },
  direct: {
    id: "direct",
    label: "Straight-shooter",
    description: "Brisk and minimal. No small talk.",
    voice: "echo",
    tone: "Be brisk and minimal: give the answer first, in as few words as possible, with no pleasantries, filler or small talk. Stay polite, just efficient.",
  },
};

/** The pre-rendered preview clip (public/voice-samples, made by scripts/generate-voice-persona-samples.mjs). */
export function voicePersonaSampleUrl(id: VoicePersonaId): string {
  return `/voice-samples/${id}.mp3`;
}

export function isVoicePersonaId(value: unknown): value is VoicePersonaId {
  return typeof value === "string" && (VOICE_PERSONA_IDS as readonly string[]).includes(value);
}

/** An unknown or missing id falls back to the default rather than failing a call. */
export function resolveVoicePersona(id: unknown): VoicePersona {
  return VOICE_PERSONAS[isVoicePersonaId(id) ? id : DEFAULT_VOICE_PERSONA_ID];
}

/** The tone block spliced into the call instructions; empty for a persona with no tone. */
export function buildToneBlock(persona: VoicePersona): string {
  return persona.tone ? `SPEAKING STYLE -- applies to how you sound, never to what you do. Every other rule in these instructions still decides each action and confirmation. ${persona.tone}` : "";
}
