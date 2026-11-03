import { describe, expect, it } from "vitest";
import { REALTIME_DEFAULT_MODEL, REALTIME_DEFAULT_VOICE } from "../constants";
import { buildSessionConfig, resolveModel, resolveVoice, supportsReasoning } from "../session-config";
import { buildRealtimeTools } from "../tools";

describe("buildSessionConfig", () => {
  const config = buildSessionConfig({ instructions: "You are the assistant." });

  it("sets up an audio-out realtime session with the call's instructions and tools", () => {
    expect(config).toMatchObject({ type: "realtime", model: REALTIME_DEFAULT_MODEL, instructions: "You are the assistant.", output_modalities: ["audio"], tool_choice: "auto" });
    expect(config.tools).toEqual(buildRealtimeTools());
  });

  it("lets the model stop talking when the user starts, and answer when they finish", () => {
    expect(config.audio?.input?.turn_detection).toMatchObject({ type: "semantic_vad", create_response: true, interrupt_response: true });
  });

  it("always transcribes the user's speech, because the confirm gate reads their words", () => {
    expect(config.audio?.input?.transcription?.model).toBeTruthy();
  });

  it("allows one tool call per response", () => {
    expect(config.parallel_tool_calls).toBe(false);
  });

  it("uses the default voice, and a runaway guard on response length", () => {
    expect(config.audio?.output?.voice).toBe(REALTIME_DEFAULT_VOICE);
    expect(config.max_output_tokens).toBe(2000);
  });

  it("honours an explicit model and voice", () => {
    const custom = buildSessionConfig({ instructions: "x", model: "gpt-realtime-2.1-mini", voice: "cedar" });
    expect(custom.model).toBe("gpt-realtime-2.1-mini");
    expect(custom.audio?.output?.voice).toBe("cedar");
  });

  it("asks for low reasoning effort on a reasoning model, and omits the field otherwise", () => {
    expect(config.reasoning).toEqual({ effort: "low" });
    expect(buildSessionConfig({ instructions: "x", model: "gpt-realtime-mini" })).not.toHaveProperty("reasoning");
  });
});

describe("supportsReasoning", () => {
  it.each(["gpt-realtime-2", "gpt-realtime-2.1", "gpt-realtime-3", "gpt-realtime-10.2"])("accepts %s", (model) => {
    expect(supportsReasoning(model)).toBe(true);
  });

  it.each(["gpt-realtime", "gpt-realtime-1.5", "gpt-realtime-mini", "gpt-realtime-2.1-mini", "gpt-realtime-2025-08-28", "gpt-4o-realtime-preview", ""])("rejects %s", (model) => {
    expect(supportsReasoning(model)).toBe(false);
  });
});

describe("model and voice overrides", () => {
  it("fall back to the defaults, and take REALTIME_MODEL / REALTIME_VOICE when set", () => {
    expect(resolveModel({})).toBe(REALTIME_DEFAULT_MODEL);
    expect(resolveVoice({})).toBe(REALTIME_DEFAULT_VOICE);
    expect(resolveModel({ REALTIME_MODEL: "gpt-realtime-2" })).toBe("gpt-realtime-2");
    expect(resolveVoice({ REALTIME_VOICE: "cedar" })).toBe("cedar");
    expect(resolveModel({ REALTIME_MODEL: "" })).toBe(REALTIME_DEFAULT_MODEL);
  });
});
