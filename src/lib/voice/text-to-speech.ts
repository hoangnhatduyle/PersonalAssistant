import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

export interface SynthesizeFn {
  (text: string): Promise<Buffer>;
}

// A known-good default ElevenLabs voice id (Alice, per the SDK's own
// README example) — not a secret, just a voice selection. Override via
// ELEVENLABS_VOICE_ID for a different voice.
const DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2";

async function readableStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function getElevenLabsStream(text: string): Promise<ReadableStream<Uint8Array>> {
  const client = new ElevenLabsClient({ apiKey: requireEnv("ELEVENLABS_API_KEY") });
  return client.textToSpeech.convert(process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID, {
    text,
    modelId: "eleven_flash_v2_5",
    // Pinned explicitly (SPEC-API-010) rather than relying on ElevenLabs'
    // implicit default — this is the audio/mpeg mimetype contract POST
    // /api/voice/speak promises its caller.
    outputFormat: "mp3_44100_128",
  });
}

async function synthesizeWithElevenLabs(text: string): Promise<Buffer> {
  return readableStreamToBuffer(await getElevenLabsStream(text));
}

async function getOpenAISpeechResponse(text: string): Promise<Response> {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  // Pinned explicitly (SPEC-API-010) for the same audio/mpeg contract.
  return openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: text,
    response_format: "mp3",
  });
}

async function synthesizeWithOpenAI(text: string): Promise<Buffer> {
  const response = await getOpenAISpeechResponse(text);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Reads the first chunk off `stream` before handing it back, so a caller can
 * confirm the provider actually started producing bytes before committing to
 * it as an outgoing response body -- a failure here can still fall back to a
 * different provider, since nothing has reached the client yet. A failure on
 * any LATER read (after the caller has already started streaming committed
 * bytes downstream) is not recoverable the same way and just propagates as a
 * truncated stream -- there is no take-backs once the first chunk shipped.
 */
function peekFirstChunk(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  return reader.read().then(
    (first) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          if (first.done) controller.close();
          else controller.enqueue(first.value);
        },
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      }),
  );
}

/**
 * Streaming counterpart to synthesizeSpeech: returns the raw provider stream
 * instead of buffering it into a Buffer, so POST /api/voice/speak can start
 * shipping bytes to the client before the whole clip has been generated.
 * Provider-fallback semantics mirror synthesizeSpeech's, constrained to what
 * peekFirstChunk makes possible -- see its doc comment.
 */
export async function synthesizeSpeechStream(text: string): Promise<ReadableStream<Uint8Array>> {
  const provider = process.env.TTS_PROVIDER;
  if (provider === "elevenlabs") {
    try {
      return await peekFirstChunk(await getElevenLabsStream(text));
    } catch (error) {
      // Same security-review rationale as synthesizeSpeech's catch below:
      // log only the message, never the raw error object (may embed `text`).
      console.error("ElevenLabs streaming TTS failed before first byte, falling back to OpenAI:", error instanceof Error ? error.message : error);
      const response = await getOpenAISpeechResponse(text);
      if (!response.body) throw new Error("OpenAI speech response had no body stream");
      return response.body;
    }
  }
  const response = await getOpenAISpeechResponse(text);
  if (!response.body) throw new Error("OpenAI speech response had no body stream");
  return response.body;
}

/**
 * SPEC-VOICE-005: text-to-speech provider switch, controlled by
 * TTS_PROVIDER. "elevenlabs" keeps the original ElevenLabs Flash v2.5 call
 * (falling back to OpenAI on failure, per the recorded stack decision).
 * Anything else, including unset, defaults to OpenAI directly — no
 * ElevenLabs fallback on failure, since ElevenLabs is ~6.7x more expensive
 * per character and falling back to it on every OpenAI hiccup would
 * silently reintroduce that cost premium.
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const provider = process.env.TTS_PROVIDER;
  if (provider === "elevenlabs") {
    try {
      return await synthesizeWithElevenLabs(text);
    } catch (error) {
      // Security-review finding: log only the message, never the raw error
      // object — some HTTP-client error wrappers embed the outbound request
      // (including this function's caller-supplied `text`, potentially
      // sensitive per this project's NC-003), which a full object dump would
      // otherwise write to plaintext server logs.
      console.error("ElevenLabs TTS failed, falling back to OpenAI:", error instanceof Error ? error.message : error);
      return await synthesizeWithOpenAI(text);
    }
  }
  return await synthesizeWithOpenAI(text);
}
