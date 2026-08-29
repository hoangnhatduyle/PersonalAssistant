import { describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createKnowledgeChunk,
  createKnowledgeSource,
  fakeEmbedding,
  walkTransitions,
} from "./helpers";

// Traces: SPEC-DATA-011 AC-003, AC-003b, NC-DATA-016, NC-DATA-025.
describe("knowledge_sources status enforcement", () => {
  const admin = adminClient();

  it("AC-003: rejects an insert specifying a status other than Pending", async () => {
    const user = await createAuthenticatedUser();
    const { error } = await admin
      .from("knowledge_sources")
      .insert({ user_id: user.userId, source_type: "pasted_text", title: "t", status: "Ready" });
    expect(error).not.toBeNull();
  });

  it("AC-003b: an authenticated UPDATE is rejected outright, whether it targets status or only error_message", async () => {
    // Architect-review finding: UPDATE is now explicitly revoked from
    // anon/authenticated (NC-DATA-016's stated *primary* defense —
    // PostgREST checks the table-level grant before RLS or any trigger
    // runs), matching knowledge_chunks' own explicit-REVOKE pattern below.
    // This now errors outright rather than silently filtering to zero rows.
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);

    const { error: statusError, count: statusCount } = await user.client
      .from("knowledge_sources")
      .update({ status: "Ready" }, { count: "exact" })
      .eq("id", id);
    expect(statusError).not.toBeNull();
    expect(statusCount ?? 0).toBe(0);

    const { error: msgError, count: msgCount } = await user.client
      .from("knowledge_sources")
      .update({ error_message: "hand-crafted" }, { count: "exact" })
      .eq("id", id);
    expect(msgError).not.toBeNull();
    expect(msgCount ?? 0).toBe(0);

    const { data: untouched } = await admin
      .from("knowledge_sources")
      .select("status, error_message")
      .eq("id", id)
      .single();
    expect(untouched?.status).toBe("Pending");
    expect(untouched?.error_message).toBeNull();
  });

  it("NC-DATA-016: rejects an admin UPDATE that touches error_message without a status transition", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);

    const { error } = await admin.from("knowledge_sources").update({ error_message: "sneaky" }).eq("id", id);
    expect(error).not.toBeNull();
  });

  it("rejects a forbidden transition (Ready -> Pending) even via a direct admin UPDATE", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing", "Ready"]);

    const { error } = await admin.from("knowledge_sources").update({ status: "Pending" }).eq("id", id);
    expect(error).not.toBeNull();
  });
});

// Traces: SPEC-DATA-011 AC-003c, NC-DATA-024.
describe("knowledge_chunks write lockdown", () => {
  const admin = adminClient();

  it("AC-003c: rejects a direct authenticated INSERT", async () => {
    const user = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId);

    const { error } = await user.client.from("knowledge_chunks").insert({
      source_id: sourceId,
      user_id: user.userId,
      chunk_index: 0,
      chunk_text: "forged",
      embedding: fakeEmbedding(),
    });
    expect(error).not.toBeNull();
  });

  it("AC-003c: rejects a direct authenticated UPDATE and DELETE", async () => {
    const user = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId);
    const chunkId = await createKnowledgeChunk(admin, sourceId, user.userId);

    const { error: updateError } = await user.client
      .from("knowledge_chunks")
      .update({ chunk_text: "forged" })
      .eq("id", chunkId);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await user.client.from("knowledge_chunks").delete().eq("id", chunkId);
    expect(deleteError).not.toBeNull();
  });
});

// Traces: SPEC-DATA-011 AC-004, AC-004b, AC-007.
describe("cascade delete and composite FK", () => {
  const admin = adminClient();

  it("AC-004/AC-007: deleting a knowledge_source removes its chunks via FK cascade, despite chunks having no direct delete grant", async () => {
    const user = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, user.userId);
    await createKnowledgeChunk(admin, sourceId, user.userId, { chunk_index: 0 });
    await createKnowledgeChunk(admin, sourceId, user.userId, { chunk_index: 1 });

    const { error } = await user.client.from("knowledge_sources").delete().eq("id", sourceId);
    expect(error).toBeNull();

    const { data: remaining } = await admin.from("knowledge_chunks").select("id").eq("source_id", sourceId);
    expect(remaining ?? []).toHaveLength(0);
  });

  it("AC-004b: rejects a chunk insert whose (source_id, user_id) pair doesn't match an existing source", async () => {
    const userA = await createAuthenticatedUser();
    const userB = await createAuthenticatedUser();
    const sourceId = await createKnowledgeSource(admin, userA.userId);

    const { error } = await admin.from("knowledge_chunks").insert({
      source_id: sourceId,
      user_id: userB.userId, // mismatched -- no (sourceId, userB.userId) row exists
      chunk_index: 0,
      chunk_text: "mismatched",
      embedding: fakeEmbedding(),
    });
    expect(error).not.toBeNull();
  });
});

// Traces: SPEC-DATA-011 AC-008, NC-DATA-023, NC-DATA-030.
describe("named writer functions: CAS guards", () => {
  const admin = adminClient();

  it("start_knowledge_import succeeds from Pending and is a no-op against a non-Pending row", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);

    const { data: first, error: firstError } = await admin.rpc("start_knowledge_import", { p_source_id: id });
    expect(firstError).toBeNull();
    expect(first).toBe(true);

    const { data: second, error: secondError } = await admin.rpc("start_knowledge_import", { p_source_id: id });
    expect(secondError).toBeNull();
    expect(second).toBe(false);
  });

  it("complete_knowledge_import atomically writes raw_content, replaces chunks, and flips to Ready", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing"]);
    await createKnowledgeChunk(admin, id, user.userId, { chunk_index: 0, chunk_text: "stale" });

    const { data: ok, error } = await admin.rpc("complete_knowledge_import", {
      p_source_id: id,
      p_raw_content: "fresh content",
      p_chunks: [{ chunk_index: 0, chunk_text: "new chunk", embedding: fakeEmbedding(1) }],
    });
    expect(error).toBeNull();
    expect(ok).toBe(true);

    const { data: source } = await admin
      .from("knowledge_sources")
      .select("status, raw_content")
      .eq("id", id)
      .single();
    expect(source?.status).toBe("Ready");
    expect(source?.raw_content).toBe("fresh content");

    const { data: chunks } = await admin.from("knowledge_chunks").select("chunk_text").eq("source_id", id);
    expect(chunks ?? []).toHaveLength(1);
    expect(chunks?.[0]?.chunk_text).toBe("new chunk");
  });

  it("fail_knowledge_import is a no-op against a row not in Processing", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId); // Pending, not Processing

    const { data: ok, error } = await admin.rpc("fail_knowledge_import", {
      p_source_id: id,
      p_error_message: "boom",
    });
    expect(error).toBeNull();
    expect(ok).toBe(false);
  });

  it("NC-022: retry_knowledge_import is capped at 3 attempts", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing"]);
    await admin.from("knowledge_sources").update({ status: "Failed", attempt_count: 3 }).eq("id", id);

    const { data: ok, error } = await user.client.rpc("retry_knowledge_import", { p_source_id: id });
    expect(error).toBeNull();
    expect(ok).toBe(false);

    const { data: source } = await admin.from("knowledge_sources").select("status").eq("id", id).single();
    expect(source?.status).toBe("Failed");
  });

  it("retry_knowledge_import succeeds under the cap and clears error_message", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing"]);
    await admin
      .from("knowledge_sources")
      .update({ status: "Failed", attempt_count: 1, error_message: "previous failure" })
      .eq("id", id);

    const { data: ok, error } = await user.client.rpc("retry_knowledge_import", { p_source_id: id });
    expect(error).toBeNull();
    expect(ok).toBe(true);

    const { data: source } = await admin
      .from("knowledge_sources")
      .select("status, attempt_count, error_message")
      .eq("id", id)
      .single();
    expect(source?.status).toBe("Processing");
    expect(source?.attempt_count).toBe(2);
    expect(source?.error_message).toBeNull();
  });

  it("retry_knowledge_import rejects retrying another user's source", async () => {
    const userA = await createAuthenticatedUser();
    const userB = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, userA.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing"]);
    await admin.from("knowledge_sources").update({ status: "Failed" }).eq("id", id);

    const { data: ok, error } = await userB.client.rpc("retry_knowledge_import", { p_source_id: id });
    expect(error).toBeNull();
    expect(ok).toBe(false);
  });
});

// Traces: SPEC-DATA-011 AC-006, NC-DATA-027.
describe("reap_stuck_knowledge_imports", () => {
  const admin = adminClient();
  const MINUTES_11_AGO = new Date(Date.now() - 11 * 60_000).toISOString();

  it("AC-006: transitions a stuck Processing row to Failed with a timeout message", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing"]);
    await admin.from("knowledge_sources").update({ processing_started_at: MINUTES_11_AGO }).eq("id", id);

    const { error } = await admin.rpc("reap_stuck_knowledge_imports");
    expect(error).toBeNull();

    const { data: source } = await admin
      .from("knowledge_sources")
      .select("status, error_message")
      .eq("id", id)
      .single();
    expect(source?.status).toBe("Failed");
    expect(source?.error_message).not.toBeNull();
  });

  it("AC-006: transitions a stuck Pending row (never started) using created_at as the fallback clock", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId, { created_at: MINUTES_11_AGO });

    await admin.rpc("reap_stuck_knowledge_imports");

    const { data: source } = await admin.from("knowledge_sources").select("status").eq("id", id).single();
    expect(source?.status).toBe("Failed");
  });

  it("does not touch a Processing row still within its timeout window", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing"]);
    await admin
      .from("knowledge_sources")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", id);

    await admin.rpc("reap_stuck_knowledge_imports");

    const { data: source } = await admin.from("knowledge_sources").select("status").eq("id", id).single();
    expect(source?.status).toBe("Processing");
  });

  it("never reaps a Ready source regardless of age", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId, { created_at: MINUTES_11_AGO });
    await walkTransitions(admin, "knowledge_sources", id, "status", ["Processing", "Ready"]);

    await admin.rpc("reap_stuck_knowledge_imports");

    const { data: source } = await admin.from("knowledge_sources").select("status").eq("id", id).single();
    expect(source?.status).toBe("Ready");
  });
});

// Traces: SPEC-DATA-011 NC-DATA-023, NC-DATA-026, NC-DATA-030 (EXECUTE lockdown).
describe("function EXECUTE grants", () => {
  const admin = adminClient();

  it("denies start_knowledge_import/complete_knowledge_import/fail_knowledge_import/reap_stuck_knowledge_imports to a non-service caller", async () => {
    const user = await createAuthenticatedUser();
    const id = await createKnowledgeSource(admin, user.userId);

    const { error: startError } = await user.client.rpc("start_knowledge_import", { p_source_id: id });
    expect(startError).not.toBeNull();

    const { error: completeError } = await user.client.rpc("complete_knowledge_import", {
      p_source_id: id,
      p_raw_content: "x",
      p_chunks: [],
    });
    expect(completeError).not.toBeNull();

    const { error: failError } = await user.client.rpc("fail_knowledge_import", {
      p_source_id: id,
      p_error_message: "x",
    });
    expect(failError).not.toBeNull();

    const { error: reapError } = await user.client.rpc("reap_stuck_knowledge_imports");
    expect(reapError).not.toBeNull();
  });
});
