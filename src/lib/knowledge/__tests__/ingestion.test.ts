import { describe, expect, it, vi } from "vitest";
import { adminClient, createAuthenticatedUser, createKnowledgeSource, walkTransitions, type TestUser } from "../../../../supabase/tests/helpers";
import { processKnowledgeImport, type IngestionDeps } from "../ingestion";
import { defaultExtractionDeps } from "../extraction";

// Traces: SPEC-CORE-008 AC-002, AC-003, AC-004, NC-020 (all-or-nothing
// completion), SPEC-DATA-011's CAS guard re-asserted at the orchestration
// layer.
describe("processKnowledgeImport", () => {
  const admin = adminClient();

  async function sourceRow(id: string) {
    const { data } = await admin.from("knowledge_sources").select("*").eq("id", id).single();
    return data!;
  }

  function depsWithEmbed(embedTexts: IngestionDeps["embedTexts"]): IngestionDeps {
    return {
      // pasted_text never touches these — asserts that by making every
      // extraction dep an unconditional throw.
      extraction: {
        ...defaultExtractionDeps,
        fetchUrl: vi.fn().mockRejectedValue(new Error("should not be called for pasted_text")),
        describeImage: vi.fn().mockRejectedValue(new Error("should not be called for pasted_text")),
        transcribeAudio: vi.fn().mockRejectedValue(new Error("should not be called for pasted_text")),
        runMediaExtraction: vi.fn().mockRejectedValue(new Error("should not be called for pasted_text")),
      },
      embedTexts,
    };
  }

  it("AC-002: successful processing produces Ready + chunks with populated embeddings", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId, {
      source_type: "pasted_text",
      raw_content: "This is the pasted reference text to chunk and embed.",
    });

    const embedTexts = vi.fn().mockImplementation(async (texts: string[]) => texts.map(() => Array.from({ length: 1536 }, () => 0.1)));

    await processKnowledgeImport(admin, sourceId, { deps: depsWithEmbed(embedTexts) });

    const row = await sourceRow(sourceId);
    expect(row.status).toBe("Ready");
    expect(row.error_message).toBeNull();
    expect(row.raw_content).toBe("This is the pasted reference text to chunk and embed.");

    const { data: chunks } = await admin.from("knowledge_chunks").select("chunk_text, embedding").eq("source_id", sourceId);
    expect(chunks ?? []).toHaveLength(1);
    expect(chunks?.[0]?.chunk_text).toBe("This is the pasted reference text to chunk and embed.");
    expect(embedTexts).toHaveBeenCalledTimes(1);
  });

  it("AC-003: a failure during processing leaves the source Failed with zero orphaned chunks", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId, {
      source_type: "pasted_text",
      raw_content: "Text that will fail to embed.",
    });

    const embedTexts = vi.fn().mockRejectedValue(new Error("embedding vendor call failed"));

    await processKnowledgeImport(admin, sourceId, { deps: depsWithEmbed(embedTexts) });

    const row = await sourceRow(sourceId);
    expect(row.status).toBe("Failed");
    expect(row.error_message).not.toBeNull();
    // NC-API-004 pattern: the vendor error's internals never land in the
    // user-readable column — only the fixed generic message does.
    expect(row.error_message).not.toContain("embedding vendor call failed");

    const { data: chunks } = await admin.from("knowledge_chunks").select("id").eq("source_id", sourceId);
    expect(chunks ?? []).toHaveLength(0);
  });

  it("is a CAS no-op against a source already Ready — never re-processes or re-embeds", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId, {
      source_type: "pasted_text",
      raw_content: "Already-processed text.",
    });

    const embedTexts = vi.fn().mockImplementation(async (texts: string[]) => texts.map(() => Array.from({ length: 1536 }, () => 0.2)));
    await processKnowledgeImport(admin, sourceId, { deps: depsWithEmbed(embedTexts) });
    expect(embedTexts).toHaveBeenCalledTimes(1);

    // Second call against the now-Ready row: start_knowledge_import's CAS
    // guard returns false (only matches status = Pending), so nothing else
    // in processKnowledgeImport should run.
    await processKnowledgeImport(admin, sourceId, { deps: depsWithEmbed(embedTexts) });
    expect(embedTexts).toHaveBeenCalledTimes(1);

    const row = await sourceRow(sourceId);
    expect(row.status).toBe("Ready");
  });

  // Regression test for the architect-review CRITICAL finding: retry was a
  // complete no-op because processKnowledgeImport's default
  // start_knowledge_import call only matches a Pending row, but
  // retry_knowledge_import (called by the retry route before this function
  // ever runs) sets Processing — the two CAS guards never agreed, so
  // ingestion silently never ran on any retry. This mirrors what the retry
  // route actually does: call retry_knowledge_import first (here simulated
  // via walkTransitions, since the RPC itself is exercised end to end by
  // supabase/tests/knowledge-lifecycle.test.ts), then invoke
  // processKnowledgeImport with skipStartTransition: true.
  it("skipStartTransition: true actually processes a Failed-then-retried source (retry path)", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId, {
      source_type: "pasted_text",
      raw_content: "Text to retry.",
    });
    // Simulates retry_knowledge_import's Failed -> Processing transition
    // (attempt_count/error_message bookkeeping already covered by that
    // RPC's own tests) — this row is Processing, never Pending, when
    // processKnowledgeImport is invoked below.
    await walkTransitions(admin, "knowledge_sources", sourceId, "status", ["Processing", "Failed", "Processing"]);

    const embedTexts = vi.fn().mockImplementation(async (texts: string[]) => texts.map(() => Array.from({ length: 1536 }, () => 0.3)));
    await processKnowledgeImport(admin, sourceId, { skipStartTransition: true, deps: depsWithEmbed(embedTexts) });

    expect(embedTexts).toHaveBeenCalledTimes(1);
    const row = await sourceRow(sourceId);
    expect(row.status).toBe("Ready");

    const { data: chunks } = await admin.from("knowledge_chunks").select("id").eq("source_id", sourceId);
    expect(chunks ?? []).toHaveLength(1);
  });

  it("without skipStartTransition, a Processing (retried) row is wrongly skipped — documents the bug this option fixes", async () => {
    const user: TestUser = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId, {
      source_type: "pasted_text",
      raw_content: "Text that would be silently skipped.",
    });
    await walkTransitions(admin, "knowledge_sources", sourceId, "status", ["Processing", "Failed", "Processing"]);

    const embedTexts = vi.fn();
    await processKnowledgeImport(admin, sourceId, { deps: depsWithEmbed(embedTexts) });

    // start_knowledge_import's CAS only matches Pending, so it silently
    // no-ops here — this is exactly the stuck-in-Processing state the
    // retry route's skipStartTransition: true option exists to avoid.
    expect(embedTexts).not.toHaveBeenCalled();
    const row = await sourceRow(sourceId);
    expect(row.status).toBe("Processing");
  });
});
