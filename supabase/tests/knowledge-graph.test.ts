import { describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createKnowledgeChunk, createKnowledgeSource, walkTransitions } from "./helpers";

const DIMS = 1536;

/** A 2D-plane embedding (e0*cos(theta) + e1*sin(theta)) so pairwise cosine similarity is exactly cos(theta difference). */
function embeddingAtAngle(thetaRadians: number): string {
  const values = new Array(DIMS).fill(0);
  values[0] = Math.cos(thetaRadians);
  values[1] = Math.sin(thetaRadians);
  return `[${values.join(",")}]`;
}

describe("knowledge graph", () => {
  const admin = adminClient();

  async function readySourceWithChunk(userId: string, thetaRadians: number, overrides: Record<string, unknown> = {}): Promise<string> {
    const id = await createKnowledgeSource(admin, userId, overrides);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing", "Ready"]);
    await createKnowledgeChunk(admin, id, userId, { embedding: embeddingAtAngle(thetaRadians) });
    return id;
  }

  describe("knowledge_similar_edges", () => {
    it("links Ready sources whose centroids clear the threshold and omits distant ones", async () => {
      const user = await createAuthenticatedUser();
      const close1 = await readySourceWithChunk(user.userId, 0);
      const close2 = await readySourceWithChunk(user.userId, Math.acos(0.9));
      await readySourceWithChunk(user.userId, Math.PI / 2); // orthogonal to close1 (cos = 0)

      const { data, error } = await user.client.rpc("knowledge_similar_edges", { p_threshold: 0.5, p_top_k: 5 });
      expect(error).toBeNull();
      const pairs = (data ?? []).map((row: { source_a: string; source_b: string }) => [row.source_a, row.source_b].sort());
      expect(pairs).toContainEqual([close1, close2].sort());
      // The orthogonal source pairs with nothing above 0.5 (cos(pi/2 - acos(0.9)) ~ 0.436).
      expect(pairs).toHaveLength(1);
    });

    it("excludes sources that are not Ready", async () => {
      const user = await createAuthenticatedUser();
      await readySourceWithChunk(user.userId, 0);
      const pendingId = await createKnowledgeSource(admin, user.userId);
      await createKnowledgeChunk(admin, pendingId, user.userId, { embedding: embeddingAtAngle(0) });

      const { data, error } = await user.client.rpc("knowledge_similar_edges", { p_threshold: 0.5, p_top_k: 5 });
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("keeps only each node's top-k neighbours", async () => {
      const user = await createAuthenticatedUser();
      const hub = await readySourceWithChunk(user.userId, 0);
      for (const angle of [0.05, 0.1, 0.15]) await readySourceWithChunk(user.userId, angle);

      const { data, error } = await user.client.rpc("knowledge_similar_edges", { p_threshold: 0, p_top_k: 1 });
      expect(error).toBeNull();
      // With k=1 every node keeps only its single nearest neighbour, so the 4 nodes cannot form all 6 pairs.
      expect((data ?? []).length).toBeLessThan(6);
      expect((data ?? []).some((row: { source_a: string; source_b: string }) => row.source_a === hub || row.source_b === hub)).toBe(true);
    });

    it("never returns another user's sources", async () => {
      const userA = await createAuthenticatedUser();
      const userB = await createAuthenticatedUser();
      await readySourceWithChunk(userA.userId, 0);
      await readySourceWithChunk(userA.userId, 0.01);

      const { data, error } = await userB.client.rpc("knowledge_similar_edges", { p_threshold: 0, p_top_k: 5 });
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("knowledge_graph_nodes", () => {
    it("truncates raw_content to the snippet length and is scoped to the caller", async () => {
      const userA = await createAuthenticatedUser();
      const userB = await createAuthenticatedUser();
      await createKnowledgeSource(admin, userA.userId, { title: "Mine", raw_content: "abcdefghij" });
      await createKnowledgeSource(admin, userB.userId, { title: "Theirs", raw_content: "zzz" });

      const { data, error } = await userA.client.rpc("knowledge_graph_nodes", { p_snippet_chars: 4 });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]).toMatchObject({ title: "Mine", snippet: "abcd" });
    });
  });

  describe("knowledge_links", () => {
    async function twoSources(userId: string): Promise<[string, string]> {
      const a = await createKnowledgeSource(admin, userId);
      const b = await createKnowledgeSource(admin, userId);
      return a < b ? [a, b] : [b, a];
    }

    it("creates a link in canonical order and rejects the reverse order and duplicates", async () => {
      const user = await createAuthenticatedUser();
      const [low, high] = await twoSources(user.userId);

      const ok = await user.client.from("knowledge_links").insert({ user_id: user.userId, source_a: low, source_b: high });
      expect(ok.error).toBeNull();

      const reversed = await user.client.from("knowledge_links").insert({ user_id: user.userId, source_a: high, source_b: low });
      expect(reversed.error).not.toBeNull();

      const duplicate = await user.client.from("knowledge_links").insert({ user_id: user.userId, source_a: low, source_b: high });
      expect(duplicate.error).not.toBeNull();
    });

    it("rejects a self-link", async () => {
      const user = await createAuthenticatedUser();
      const id = await createKnowledgeSource(admin, user.userId);
      const { error } = await user.client.from("knowledge_links").insert({ user_id: user.userId, source_a: id, source_b: id });
      expect(error).not.toBeNull();
    });

    it("rejects a link to another user's source (composite FK)", async () => {
      const userA = await createAuthenticatedUser();
      const userB = await createAuthenticatedUser();
      const mine = await createKnowledgeSource(admin, userA.userId);
      const theirs = await createKnowledgeSource(admin, userB.userId);
      const [low, high] = mine < theirs ? [mine, theirs] : [theirs, mine];

      const { error } = await userA.client.from("knowledge_links").insert({ user_id: userA.userId, source_a: low, source_b: high });
      expect(error).not.toBeNull();
    });

    it("hides links from other users", async () => {
      const userA = await createAuthenticatedUser();
      const userB = await createAuthenticatedUser();
      const [low, high] = await twoSources(userA.userId);
      await userA.client.from("knowledge_links").insert({ user_id: userA.userId, source_a: low, source_b: high });

      const { data, error } = await userB.client.from("knowledge_links").select("id");
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("cascades when either source is deleted", async () => {
      const user = await createAuthenticatedUser();
      const [low, high] = await twoSources(user.userId);
      await admin.from("knowledge_links").insert({ user_id: user.userId, source_a: low, source_b: high });

      await admin.from("knowledge_sources").delete().eq("id", low);
      const { data } = await admin.from("knowledge_links").select("id").eq("user_id", user.userId);
      expect(data ?? []).toHaveLength(0);
    });

    it("has no UPDATE privilege for authenticated users", async () => {
      const user = await createAuthenticatedUser();
      const [low, high] = await twoSources(user.userId);
      const { data: link } = await admin
        .from("knowledge_links")
        .insert({ user_id: user.userId, source_a: low, source_b: high })
        .select("id")
        .single();

      const { error } = await user.client.from("knowledge_links").update({ source_b: low }).eq("id", link?.id);
      expect(error).not.toBeNull();
    });
  });
});
