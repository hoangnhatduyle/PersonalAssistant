import OpenAI from "openai";
import { requireEnv } from "@/lib/env";
import { KNOWLEDGE_EMBEDDING_BATCH_SIZE, KNOWLEDGE_EMBEDDING_MODEL } from "@/lib/knowledge/constants";

export interface EmbedTextsFn {
  (texts: string[]): Promise<number[][]>;
}

/**
 * SPEC-DATA-011's embedding column is vector(1536) (text-embedding-3-small's
 * dimensionality) — mirrors the OpenAI client construction in
 * src/lib/voice/intent.ts. Returns embeddings in the same order as `texts`.
 *
 * Security-review finding: a single embeddings.create call carrying every
 * chunk of a large source risked exceeding OpenAI's per-request token/array
 * limits, which would then fail identically (and permanently, since a
 * retry re-sends the same oversized batch) on all 3 retry attempts. Batches
 * requests instead — KNOWLEDGE_MAX_CHUNKS_PER_SOURCE in ingestion.ts bounds
 * the total batch count this can ever produce.
 */
export const embedTexts: EmbedTextsFn = async (texts) => {
  if (texts.length === 0) return [];
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += KNOWLEDGE_EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + KNOWLEDGE_EMBEDDING_BATCH_SIZE);
    const response = await openai.embeddings.create({ model: KNOWLEDGE_EMBEDDING_MODEL, input: batch });
    embeddings.push(...response.data.map((item) => item.embedding));
  }
  return embeddings;
};
