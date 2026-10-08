import OpenAI from "openai";
import { requireEnv } from "@/lib/env";
import { TRIAGE_MODEL } from "@/lib/email-triage/constants";
import {
  parseStage1Response,
  STAGE1_SYSTEM_PROMPT,
  type Stage1Input,
  type Stage1Result,
} from "@/lib/email-triage/stage1";
import {
  parseStage2Response,
  STAGE2_SYSTEM_PROMPT,
  type RawSuggestedAction,
  type Stage2Input,
} from "@/lib/email-triage/stage2";

/**
 * OpenAI calls for the two triage stages (chat completions + json_object, the
 * same shape as weekly-review/generate-narrative.ts). Unlike that file there is
 * NO deterministic fallback: a failed classification must not silently file
 * mail under a bucket, so errors propagate to the caller.
 */
export async function classifyMessages(inputs: Stage1Input[]): Promise<Stage1Result[]> {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: TRIAGE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: STAGE1_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ messages: inputs }) },
    ],
  });
  return parseStage1Response(completion.choices[0]?.message.content, new Set(inputs.map((input) => input.ref)));
}

export async function extractSuggestedAction(input: Stage2Input): Promise<RawSuggestedAction | null> {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: TRIAGE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: STAGE2_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  return parseStage2Response(completion.choices[0]?.message.content);
}
