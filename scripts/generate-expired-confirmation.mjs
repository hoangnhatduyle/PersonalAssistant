// One-off generator: synthesizes the single spoken line played by
// ConfirmationBar when its own confirmation countdown lapses with no
// reply (src/lib/voice/play-audio.ts's playStaticAudio). Uses the same
// OpenAI TTS voice as real responses (see
// src/lib/voice/text-to-speech.ts's synthesizeWithOpenAI) for consistency.
// Re-run with `node scripts/generate-expired-confirmation.mjs` if the line
// or voice changes. Keep TEXT in sync with the spoken cue ConfirmationBar
// no longer needs to synthesize live for this case.
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
const outDir = path.join(rootDir, "public", "sounds");
const outFile = path.join(outDir, "confirmation-expired.mp3");

// A single fixed line, unlike thinking-fillers.mjs's 10-variant pool --
// this plays only when a proposed change is never confirmed or declined in
// time, which should be rare, so repetition isn't a real concern here.
const TEXT = "I didn't hear back, so I didn't make that change. Let me know if you'd like anything else.";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set (checked .env.local and the environment)");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await mkdir(outDir, { recursive: true });

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: TEXT,
    response_format: "mp3",
  });
  await writeFile(outFile, Buffer.from(await response.arrayBuffer()));
  console.log(`Generated ${path.relative(rootDir, outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
