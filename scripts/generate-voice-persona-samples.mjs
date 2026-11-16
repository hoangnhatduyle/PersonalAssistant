// One-off generator: renders a short preview clip per call-voice preset for the
// Settings "Call voice" card to play without starting a (paid) Realtime call.
// Clips are committed under public/voice-samples/<id>.mp3 and reused forever;
// only re-run (`node scripts/generate-voice-persona-samples.mjs`) when a
// preset's voice or tone changes. Keep PERSONAS in sync with
// src/lib/voice/realtime/personas.ts -- the personas unit test checks that a
// sample file exists for every preset id, not that the text matches.
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
const outDir = path.join(rootDir, "public", "voice-samples");

// The same line for every preset, so the difference heard is the voice and style.
const SAMPLE_TEXT = "Hi, I'm your assistant. You have two deadlines tomorrow and a study session at four. Shall I walk you through them?";

const PERSONAS = [
  { id: "classic", voice: "marin", speed: 1, tone: "Warm, clear and friendly." },
  {
    id: "jarvis",
    voice: "echo",
    speed: 1.1,
    tone: "The ideal AI assistant, like J.A.R.V.I.S.: professional, razor-sharp and quick, energetic, confident and polished, lively varied intonation, with dry clever wit and a touch of smart humor.",
  },
  { id: "coach", voice: "coral", speed: 1, tone: "An upbeat, encouraging coach: positive energy, sincere and brief." },
  { id: "calm", voice: "sage", speed: 0.95, tone: "Soft, slow and unhurried, reassuring and soothing. Never rushed." },
  { id: "direct", voice: "ash", speed: 1.1, tone: "Brisk and minimal: answer first, no pleasantries or filler, polite but efficient." },
];

// Optional ids on the command line regenerate only those clips (each is a paid call).
const only = process.argv.slice(2);

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set (checked .env.local and the environment)");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await mkdir(outDir, { recursive: true });

  for (const { id, voice, speed, tone } of PERSONAS) {
    if (only.length > 0 && !only.includes(id)) continue;
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: SAMPLE_TEXT,
      instructions: tone,
      speed,
      response_format: "mp3",
    });
    const file = path.join(outDir, `${id}.mp3`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`Generated ${path.relative(rootDir, file)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
