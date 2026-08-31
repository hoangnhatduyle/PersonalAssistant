import { describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createKnowledgeChunk, createKnowledgeSource, walkTransitions } from "./helpers";
import { KNOWLEDGE_RELEVANCE_THRESHOLD, KNOWLEDGE_TOP_K } from "../../src/lib/knowledge/constants";

const DIMS = 1536;

/**
 * A 2D-plane embedding literal (e0*cos(theta) + e1*sin(theta), zero
 * elsewhere) so its cosine similarity against QUERY_EMBEDDING (pure e0,
 * theta=0) is exactly cos(theta) -- lets tests pin exact similarity values
 * against KNOWLEDGE_RELEVANCE_THRESHOLD rather than relying on
 * fakeEmbedding()'s incidental correlation.
 */
function embeddingAtAngle(thetaRadians: number): string {
  const values = new Array(DIMS).fill(0);
  values[0] = Math.cos(thetaRadians);
  values[1] = Math.sin(thetaRadians);
  return `[${values.join(",")}]`;
}

const QUERY_EMBEDDING = embeddingAtAngle(0);

// Traces: SPEC-CORE-008 NC-027, SPEC-API-008 NC-API-014/NC-API-015.
describe("match_knowledge_chunks", () => {
  const admin = adminClient();

  async function readySource(userId: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const id = await createKnowledgeSource(admin, userId, overrides);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing", "Ready"]);
    return id;
  }

  it("NC-027: returns only chunks at or above the relevance threshold, ordered most-similar first", async () => {
    const user = await createAuthenticatedUser();
    const sourceId = await readySource(user.userId);
    // cos(0) = 1.0 -- above threshold
    await createKnowledgeChunk(admin, sourceId, user.userId, { chunk_index: 0, chunk_text: "identical direction", embedding: embeddingAtAngle(0) });
    // cos(acos(0.9)) = 0.9 -- above threshold
    await createKnowledgeChunk(admin, sourceId, user.userId, {
      chunk_index: 1,
      chunk_text: "close",
      embedding: embeddingAtAngle(Math.acos(0.9)),
    });
    // cos(60deg) = 0.5 -- below KNOWLEDGE_RELEVANCE_THRESHOLD (0.75), must be excluded
    await createKnowledgeChunk(admin, sourceId, user.userId, {
      chunk_index: 2,
      chunk_text: "too far",
      embedding: embeddingAtAngle(Math.PI / 3),
    });

    const { data, error } = await user.client.rpc("match_knowledge_chunks", {
      p_query_embedding: QUERY_EMBEDDING,
      p_match_threshold: KNOWLEDGE_RELEVANCE_THRESHOLD,
      p_match_count: KNOWLEDGE_TOP_K,
    });
    expect(error).toBeNull();
    expect((data ?? []).map((row: { chunk_text: string }) => row.chunk_text)).toEqual(["identical direction", "close"]);
  });

  it("scopes retrieval to the caller's own chunks -- never another user's, even at perfect similarity", async () => {
    const userA = await createAuthenticatedUser();
    const userB = await createAuthenticatedUser();
    const sourceA = await readySource(userA.userId);
    await createKnowledgeChunk(admin, sourceA, userA.userId, { embedding: embeddingAtAngle(0) });

    const { data, error } = await userB.client.rpc("match_knowledge_chunks", {
      p_query_embedding: QUERY_EMBEDDING,
      p_match_threshold: KNOWLEDGE_RELEVANCE_THRESHOLD,
      p_match_count: KNOWLEDGE_TOP_K,
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("caps results at match_count even when more chunks are sufficiently relevant", async () => {
    const user = await createAuthenticatedUser();
    const sourceId = await readySource(user.userId);
    for (let i = 0; i < 5; i++) {
      await createKnowledgeChunk(admin, sourceId, user.userId, { chunk_index: i, chunk_text: `chunk ${i}`, embedding: embeddingAtAngle(0) });
    }

    const { data, error } = await user.client.rpc("match_knowledge_chunks", {
      p_query_embedding: QUERY_EMBEDDING,
      p_match_threshold: KNOWLEDGE_RELEVANCE_THRESHOLD,
      p_match_count: 3,
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(3);
  });

  it("joins back the parent source's title/origin_url/source_type", async () => {
    const user = await createAuthenticatedUser();
    const sourceId = await readySource(user.userId, {
      title: "UC financial aid page",
      origin_url: "https://example.edu/aid",
      source_type: "url",
    });
    await createKnowledgeChunk(admin, sourceId, user.userId, { embedding: embeddingAtAngle(0) });

    const { data, error } = await user.client.rpc("match_knowledge_chunks", {
      p_query_embedding: QUERY_EMBEDDING,
      p_match_threshold: KNOWLEDGE_RELEVANCE_THRESHOLD,
      p_match_count: KNOWLEDGE_TOP_K,
    });
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({
      title: "UC financial aid page",
      origin_url: "https://example.edu/aid",
      source_type: "url",
    });
  });

  it("returns nothing for a caller with no knowledge_chunks at all", async () => {
    const user = await createAuthenticatedUser();

    const { data, error } = await user.client.rpc("match_knowledge_chunks", {
      p_query_embedding: QUERY_EMBEDDING,
      p_match_threshold: KNOWLEDGE_RELEVANCE_THRESHOLD,
      p_match_count: KNOWLEDGE_TOP_K,
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
