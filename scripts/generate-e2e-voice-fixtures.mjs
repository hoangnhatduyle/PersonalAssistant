// One-off generator for e2e/fixtures-audio/*.wav, consumed by
// e2e/assistant-voice-loop.spec.ts's fake-microphone harness (decoded via
// Web Audio's decodeAudioData and played back through a
// MediaStreamAudioDestinationNode in place of a real getUserMedia stream).
// Uses the same OpenAI TTS voice as real responses (see
// src/lib/voice/text-to-speech.ts's synthesizeWithOpenAI), and "wav" rather
// than "mp3" so the browser can decode it without a container demuxer.
// Re-run with `node scripts/generate-e2e-voice-fixtures.mjs` if the spoken
// lines need to change.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, "e2e", "fixtures-audio");

const CLIPS = [
  {
    file: "event-request.wav",
    text: "I need to create an event called Plink Cincinnati happening October 8th through October 11th, 7 PM to 11 PM every night.",
  },
  { file: "yes.wav", text: "Yes." },
];

/**
 * OpenAI's streamed WAV response writes the "unknown size" sentinel
 * (0xFFFFFFFF) into both the RIFF and data chunk size fields instead of the
 * real byte count, since it doesn't know the final size until the stream
 * ends. Chromium's AudioContext.decodeAudioData rejects that -- silently,
 * from the test's perspective, since e2e/assistant-voice-loop.spec.ts's
 * getUserMedia override just catches the rejection like any other mic
 * failure -- so both size fields must be patched to the real byte count
 * before the file is usable as a decodeAudioData input.
 */
function fixWavHeader(buffer) {
  const totalSize = buffer.length;
  buffer.writeUInt32LE(totalSize - 8, 4);
  const dataIndex = buffer.indexOf("data");
  if (dataIndex === -1) throw new Error("no data chunk found in generated WAV");
  buffer.writeUInt32LE(totalSize - (dataIndex + 8), dataIndex + 4);
  return buffer;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set (checked .env.local and the environment)");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await mkdir(outDir, { recursive: true });

  for (const clip of CLIPS) {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: clip.text,
      response_format: "wav",
    });
    const outFile = path.join(outDir, clip.file);
    await writeFile(outFile, fixWavHeader(Buffer.from(await response.arrayBuffer())));
    console.log(`Generated ${path.relative(rootDir, outFile)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
