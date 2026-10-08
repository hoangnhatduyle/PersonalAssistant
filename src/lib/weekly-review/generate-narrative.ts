import OpenAI from "openai";
import { requireEnv } from "@/lib/env";
import { buildPlainSummary } from "@/lib/weekly-review/summary";
import type { WeeklyReviewData } from "@/lib/weekly-review/types";

const NARRATIVE_SYSTEM_PROMPT = `You are a friendly personal assistant for a university student. You are given a precomputed weekly review as JSON: last week's results, what is still open or past due, and next week's load. Write a concise, honest recap in plain text, under 150 words, addressed to the student as "you".

Cover, in order: how last week went (lead with real wins, name misses plainly), what is still open or past due (if pending.unresolvedEmailCount is present, mention that many emails from the latest check are still unresolved, by count only), and what next week looks like. Use only the numbers and titles in the JSON; never invent or change a count. Weekday names, never dates. Do not give recommendations or advice: those are shown separately. No markdown, no bullet points.

Respond with ONLY a JSON object: { "narrative": string }`;

/**
 * Email subjects and senders must not reach this call: email text goes to
 * OpenAI only during the two triage stages (src/lib/email-triage). The
 * narrative gets the unresolved-email COUNT and nothing else.
 */
export function toNarrativeInput(data: WeeklyReviewData): unknown {
  const { unresolvedEmails, ...pending } = data.pending;
  return {
    ...data,
    pending: unresolvedEmails ? { ...pending, unresolvedEmailCount: unresolvedEmails.count } : pending,
  };
}

/**
 * The LLM only phrases numbers that were already computed in code. Any
 * failure (missing key, API error, bad JSON, empty text) falls back to the
 * deterministic summary, so a review never fails because the model did.
 */
export async function generateNarrative(data: WeeklyReviewData): Promise<string> {
  try {
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(toNarrativeInput(data)) },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message.content ?? "{}") as { narrative?: unknown };
    if (typeof parsed.narrative === "string" && parsed.narrative.trim()) return parsed.narrative.trim();
  } catch (error) {
    console.error("weekly review narrative failed, using deterministic summary", error);
  }
  return buildPlainSummary(data);
}
