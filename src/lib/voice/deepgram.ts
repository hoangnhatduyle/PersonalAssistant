import { DeepgramClient } from "@deepgram/sdk";
import { requireEnv } from "@/lib/env";

export interface TranscribeFn {
  (audio: Buffer, mimetype?: string): Promise<string>;
}

/**
 * SPEC-VOICE-005: Deepgram speech-to-text (vendor decision recorded). Only
 * the finished transcript is ever returned — the raw audio buffer passed in
 * here is never persisted by any caller (NC-VOICE-003).
 */
export async function transcribeAudio(audio: Buffer, mimetype = "audio/webm"): Promise<string> {
  const client = new DeepgramClient({ apiKey: requireEnv("DEEPGRAM_API_KEY") });
  const response = await client.listen.v1.media.transcribeFile(
    audio,
    { model: "nova-3", smart_format: true, punctuate: true },
    { headers: { "content-type": mimetype } },
  );
  if (!("results" in response)) return ""; // async callback mode was requested; not used here
  return response.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}
