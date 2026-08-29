import { KNOWLEDGE_CHUNK_OVERLAP_CHARS, KNOWLEDGE_CHUNK_SIZE_CHARS } from "@/lib/knowledge/constants";

/**
 * Sliding-window character chunker. Pure function (no I/O), used by
 * ingestion.ts ahead of embeddings.ts's embedTexts call. Indices are plain
 * UTF-16 code-unit offsets, same as every other .slice() in this codebase —
 * a boundary can in principle split a surrogate pair (an astral character
 * spanning two UTF-16 units), which is harmless for embeddings/OCR text but
 * worth naming accurately rather than claiming a guarantee .slice() doesn't
 * actually provide.
 */
export function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= KNOWLEDGE_CHUNK_SIZE_CHARS) return [trimmed];

  const step = KNOWLEDGE_CHUNK_SIZE_CHARS - KNOWLEDGE_CHUNK_OVERLAP_CHARS;
  const chunks: string[] = [];
  for (let start = 0; start < trimmed.length; start += step) {
    const end = Math.min(start + KNOWLEDGE_CHUNK_SIZE_CHARS, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end === trimmed.length) break;
  }
  return chunks;
}
