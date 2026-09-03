import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  elevenLabsConvert: vi.fn(),
  openAISpeechCreate: vi.fn(),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  // A regular function, not an arrow — vi.mock's ElevenLabsClient/OpenAI
  // stand-ins are invoked with `new` by the module under test, and only a
  // regular function can be used as a constructor.
  ElevenLabsClient: vi.fn().mockImplementation(function () {
    return { textToSpeech: { convert: mocks.elevenLabsConvert } };
  }),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return { audio: { speech: { create: mocks.openAISpeechCreate } } };
  }),
}));

import { synthesizeSpeechStream } from "../text-to-speech";

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

/** A stream whose very first read rejects — simulates a connection failure before any byte arrives. */
function streamFailingOnFirstRead(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(new Error("connection reset"));
    },
  });
}

/** A stream that yields one good chunk, then errors on the next read — simulates a mid-flight drop. */
function streamFailingOnSecondRead(first: Uint8Array): ReadableStream<Uint8Array> {
  let reads = 0;
  return new ReadableStream({
    pull(controller) {
      reads += 1;
      if (reads === 1) {
        controller.enqueue(first);
        return;
      }
      controller.error(new Error("stream dropped mid-flight"));
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("synthesizeSpeechStream", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-elevenlabs-key");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    mocks.elevenLabsConvert.mockReset();
    mocks.openAISpeechCreate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the ElevenLabs stream directly when the first chunk is read successfully", async () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    mocks.elevenLabsConvert.mockResolvedValue(streamFromChunks([new Uint8Array([1, 2])]));

    const stream = await synthesizeSpeechStream("hello");

    await expect(readAll(stream)).resolves.toEqual([new Uint8Array([1, 2])]);
    expect(mocks.openAISpeechCreate).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when the first ElevenLabs chunk fails to arrive", async () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    mocks.elevenLabsConvert.mockResolvedValue(streamFailingOnFirstRead());
    mocks.openAISpeechCreate.mockResolvedValue({ body: streamFromChunks([new Uint8Array([9])]) } as unknown as Response);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const stream = await synthesizeSpeechStream("hello");

    await expect(readAll(stream)).resolves.toEqual([new Uint8Array([9])]);
    expect(mocks.openAISpeechCreate).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("ElevenLabs streaming TTS failed before first byte, falling back to OpenAI:", expect.any(String));
    consoleErrorSpy.mockRestore();
  });

  it("does not fall back once a chunk has already been yielded — a later read failure just propagates", async () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    mocks.elevenLabsConvert.mockResolvedValue(streamFailingOnSecondRead(new Uint8Array([1])));

    const stream = await synthesizeSpeechStream("hello");

    await expect(readAll(stream)).rejects.toThrow();
    expect(mocks.openAISpeechCreate).not.toHaveBeenCalled();
  });

  it("uses OpenAI directly, never touching ElevenLabs, when TTS_PROVIDER is not elevenlabs", async () => {
    vi.stubEnv("TTS_PROVIDER", "openai");
    mocks.openAISpeechCreate.mockResolvedValue({ body: streamFromChunks([new Uint8Array([5])]) } as unknown as Response);

    const stream = await synthesizeSpeechStream("hello");

    await expect(readAll(stream)).resolves.toEqual([new Uint8Array([5])]);
    expect(mocks.elevenLabsConvert).not.toHaveBeenCalled();
  });

  it("throws when the OpenAI response has no body", async () => {
    vi.stubEnv("TTS_PROVIDER", "openai");
    mocks.openAISpeechCreate.mockResolvedValue({ body: null } as unknown as Response);

    await expect(synthesizeSpeechStream("hello")).rejects.toThrow(/no body/);
  });
});
