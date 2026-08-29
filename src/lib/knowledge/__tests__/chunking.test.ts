import { describe, expect, it } from "vitest";
import { chunkText } from "../chunking";
import { KNOWLEDGE_CHUNK_OVERLAP_CHARS, KNOWLEDGE_CHUNK_SIZE_CHARS } from "../constants";

describe("chunkText", () => {
  it("returns an empty array for empty/whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns a single trimmed chunk when text fits within the chunk size", () => {
    const text = "  hello world  ";
    expect(chunkText(text)).toEqual(["hello world"]);
  });

  it("splits text longer than the chunk size into multiple overlapping chunks", () => {
    const text = "a".repeat(KNOWLEDGE_CHUNK_SIZE_CHARS * 2 + 100);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(KNOWLEDGE_CHUNK_SIZE_CHARS);
    }
  });

  it("consecutive chunks overlap by the configured overlap size", () => {
    const text = "0123456789".repeat(300); // 3000 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);

    const step = KNOWLEDGE_CHUNK_SIZE_CHARS - KNOWLEDGE_CHUNK_OVERLAP_CHARS;
    const expectedSecondChunkStart = text.slice(step, step + KNOWLEDGE_CHUNK_OVERLAP_CHARS);
    expect(chunks[1].slice(0, KNOWLEDGE_CHUNK_OVERLAP_CHARS)).toBe(expectedSecondChunkStart);
  });

  it("reconstructs full coverage — every character of the input appears in some chunk", () => {
    const text = "x".repeat(KNOWLEDGE_CHUNK_SIZE_CHARS * 3 + 37);
    const chunks = chunkText(text);
    const last = chunks[chunks.length - 1];
    expect(text.endsWith(last)).toBe(true);
  });
});
