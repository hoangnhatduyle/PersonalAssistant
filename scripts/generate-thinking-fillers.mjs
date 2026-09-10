// One-off generator: synthesizes the short "thinking" filler lines played
// right before src/lib/voice/thinking-sound.ts's ambient loop starts. Uses
// the same OpenAI TTS voice as real responses (see
// src/lib/voice/text-to-speech.ts's synthesizeWithOpenAI) for consistency.
// Re-run with `node scripts/generate-thinking-fillers.mjs` if the line list
// or voice changes. Keep the slugs below in sync with
// src/lib/voice/thinking-sound.ts's FILLER_SLUGS.
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
const outDir = path.join(rootDir, "public", "sounds", "thinking-fillers");

const LINES = [
  { slug: "got-it-one-sec", text: "Got it, one sec." },
  { slug: "sure-let-me-check", text: "Sure, let me check." },
  { slug: "one-moment-please", text: "One moment, please." },
  { slug: "let-me-take-a-look", text: "Let me take a look." },
  { slug: "working-on-it", text: "Working on it." },
  { slug: "just-a-second", text: "Just a second." },
  { slug: "on-it", text: "On it." },
  { slug: "give-me-a-moment", text: "Give me a moment." },
  { slug: "let-me-see", text: "Let me see." },
  { slug: "sure-thing-one-sec", text: "Sure thing, one sec." },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set (checked .env.local and the environment)");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await mkdir(outDir, { recursive: true });

  for (const { slug, text } of LINES) {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      response_format: "mp3",
    });
    await writeFile(path.join(outDir, `${slug}.mp3`), Buffer.from(await response.arrayBuffer()));
    console.log(`Generated ${path.relative(rootDir, path.join(outDir, `${slug}.mp3`))}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
