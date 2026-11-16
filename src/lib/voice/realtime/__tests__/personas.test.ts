import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REALTIME_DEFAULT_VOICE } from "../constants";
import { buildToneBlock, DEFAULT_VOICE_PERSONA_ID, isVoicePersonaId, resolveVoicePersona, VOICE_PERSONA_IDS, VOICE_PERSONAS, voicePersonaSampleUrl } from "../personas";

describe("voice personas", () => {
  it("offers at least three presets, each keyed by its own id", () => {
    expect(VOICE_PERSONA_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of VOICE_PERSONA_IDS) expect(VOICE_PERSONAS[id].id).toBe(id);
  });

  it("keeps the default persona on the shipped voice with no added tone, so existing calls are unchanged", () => {
    const persona = VOICE_PERSONAS[DEFAULT_VOICE_PERSONA_ID];
    expect(persona.voice).toBe(REALTIME_DEFAULT_VOICE);
    expect(buildToneBlock(persona)).toBe("");
  });

  it("gives every other persona a tone and a voice of its own", () => {
    const others = VOICE_PERSONA_IDS.filter((id) => id !== DEFAULT_VOICE_PERSONA_ID).map((id) => VOICE_PERSONAS[id]);
    expect(new Set(others.map((p) => p.voice)).size).toBe(others.length);
    for (const persona of others) expect(buildToneBlock(persona)).toContain(persona.tone);
  });

  it("tells the model the style never changes what it does", () => {
    expect(buildToneBlock(VOICE_PERSONAS.butler)).toMatch(/never to what you do/i);
  });

  it("falls back to the default for an unknown, null or undefined id", () => {
    for (const bad of ["pirate", null, undefined, 3]) expect(resolveVoicePersona(bad).id).toBe(DEFAULT_VOICE_PERSONA_ID);
    expect(resolveVoicePersona("coach").id).toBe("coach");
  });

  it("has a generated preview clip on disk for every preset, so the Settings Play button never 404s", () => {
    for (const id of VOICE_PERSONA_IDS) {
      expect(existsSync(path.join(process.cwd(), "public", voicePersonaSampleUrl(id)))).toBe(true);
    }
  });

  it("recognises only real ids", () => {
    expect(isVoicePersonaId("calm")).toBe(true);
    expect(isVoicePersonaId("nope")).toBe(false);
  });
});
