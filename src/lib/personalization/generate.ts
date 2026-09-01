import OpenAI from "openai";
import { z } from "zod";
import { requireEnv } from "@/lib/env";
import { SUGGESTION_LEAD_MINUTES_BOUNDS } from "@/lib/personalization/constants";
import type { SuggestionCandidateGroup } from "@/lib/personalization/candidates";

const SYSTEM_PROMPT = `You help a student personalize their reminder timing. You are given the
current reminder lead time (in minutes before something is due) for one
Course or Task, along with recent low ratings (1-2 out of 5) and optional
comments the user left on reminders/deadlines/tasks tied to it.

Propose exactly one new lead-time value in minutes. It must never equal the
current value. Base it on what the comments actually say when they say
anything about timing (e.g. "too late", "too early", "no time to prepare");
if comments give no timing signal, make a modest, reasonable adjustment
(e.g. +/-30 minutes) rather than a large jump. Bounds: ${SUGGESTION_LEAD_MINUTES_BOUNDS.min}-${SUGGESTION_LEAD_MINUTES_BOUNDS.max}.

Respond with a JSON object only: { "to_lead_minutes": number, "rationale": string }.
rationale is one short sentence explaining the change to the user directly
(e.g. "Comments mention reminders arriving too late to prepare, so this
moves the lead time earlier.").`;

const generateSuggestionResponseSchema = z.object({
  to_lead_minutes: z.number().int().min(SUGGESTION_LEAD_MINUTES_BOUNDS.min).max(SUGGESTION_LEAD_MINUTES_BOUNDS.max),
  rationale: z.string().trim().min(1).max(500),
});

export interface GenerateSuggestionInput {
  scope: "course" | "task";
  currentLeadMinutes: number;
  feedback: SuggestionCandidateGroup["ratings"];
}

export interface GeneratedSuggestion {
  toLeadMinutes: number;
  rationale: string;
}

export interface GenerateSuggestionFn {
  (input: GenerateSuggestionInput): Promise<GeneratedSuggestion>;
}

/**
 * Calls the LLM to propose a new reminder lead time for one Course or Task,
 * given its recent low ratings/comments. Copies resolveIntent()'s exact call
 * shape (src/lib/voice/intent.ts:292-319). Exported as a plain, injectable
 * function — same seam src/lib/voice/session.ts's `resolveIntent: ResolveIntentFn`
 * dependency uses, since this repo has no vi.mock("openai") precedent to
 * lean on instead.
 */
export const generateSuggestion: GenerateSuggestionFn = async (input) => {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          scope: input.scope,
          currentLeadMinutes: input.currentLeadMinutes,
          feedback: input.feedback,
        }),
      },
    ],
  });

  const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}");
  const parsed = generateSuggestionResponseSchema.parse(raw);

  return { toLeadMinutes: parsed.to_lead_minutes, rationale: parsed.rationale };
};
