import { REALTIME_DEFAULT_VOICE } from "@/lib/voice/realtime/constants";

/**
 * The voice presets a user can pick for the live call. Each pairs one built-in
 * Realtime voice with a short tone instruction, because the instruction shapes
 * phrasing and pacing at least as much as the voice shapes timbre. Users only
 * ever choose an id, so the browser can never send an arbitrary voice string
 * or prompt text.
 */
export const VOICE_PERSONA_IDS = ["classic", "jarvis", "coach", "calm", "direct"] as const;
export type VoicePersonaId = (typeof VOICE_PERSONA_IDS)[number];

export const DEFAULT_VOICE_PERSONA_ID: VoicePersonaId = "classic";

export interface VoicePersona {
  id: VoicePersonaId;
  label: string;
  description: string;
  /** A built-in Realtime voice name. */
  voice: string;
  /** Playback speed multiplier for the call's spoken audio (1 = normal, Realtime allows 0.25-1.5). */
  speed: number;
  /** Added to the call instructions; empty keeps the shipped assistant style untouched. */
  tone: string;
}

export const VOICE_PERSONAS: Record<VoicePersonaId, VoicePersona> = {
  classic: {
    id: "classic",
    label: "Classic",
    description: "Warm, clear and friendly. The default.",
    voice: REALTIME_DEFAULT_VOICE,
    speed: 1,
    tone: "",
  },
  jarvis: {
    id: "jarvis",
    label: "Jarvis",
    description: "Sharp, witty and quick. A brilliant assistant with a sense of humor.",
    voice: "echo",
    speed: 1.1,
    tone: "Speak like J.A.R.V.I.S., the ideal AI assistant: professional, razor-sharp and quick, with an energetic, confident, polished delivery and lively, varied intonation. Be smartly funny: dry, clever one-liners and light, well-timed wit, never silly and never at the expense of the answer. Sound like you are always one step ahead, anticipating what the user needs next and offering it in a few words. Warm and respectful, never stiff, slow or monotone. Keep the humor to a touch per reply and drop it entirely when the user seems stressed or the matter is serious.",
  },
  coach: {
    id: "coach",
    label: "Coach",
    description: "Upbeat and encouraging, with gentle nudges.",
    voice: "coral",
    speed: 1,
    tone: "Speak like an upbeat, encouraging coach: positive energy, brief praise for progress, and a gentle nudge when a deadline is close. Stay sincere and keep it short; never lecture.",
  },
  calm: {
    id: "calm",
    label: "Calm",
    description: "Soft, slow and unhurried. Good for evenings.",
    voice: "sage",
    speed: 0.95,
    tone: "Speak softly, slowly and unhurriedly in a reassuring, soothing tone. Use gentle, simple phrasing and leave room to breathe between thoughts; never sound rushed or urgent.",
  },
  direct: {
    id: "direct",
    label: "Straight-shooter",
    description: "Brisk and minimal. No small talk.",
    voice: "ash",
    speed: 1.1,
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
