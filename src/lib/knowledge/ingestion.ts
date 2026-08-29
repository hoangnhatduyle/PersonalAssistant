import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { defaultExtractionDeps, extractSourceContent, type ExtractionDeps, type KnowledgeSourceRow } from "@/lib/knowledge/extraction";
import { chunkText } from "@/lib/knowledge/chunking";
import { embedTexts, type EmbedTextsFn } from "@/lib/knowledge/embeddings";
import { KNOWLEDGE_MAX_CHUNKS_PER_SOURCE, KNOWLEDGE_STORAGE_BUCKET } from "@/lib/knowledge/constants";

export interface IngestionDeps {
  extraction: ExtractionDeps;
  embedTexts: EmbedTextsFn;
}

export interface ProcessKnowledgeImportOptions {
  /**
   * Architect-review finding (CRITICAL): retry_knowledge_import already
   * performs the Failed -> Processing CAS transition itself (with
   * ownership + attempt-cap enforcement baked into its own predicate) —
   * calling start_knowledge_import afterward would look for a *Pending* row
   * that no longer exists in that state, silently no-op via its own CAS
   * guard, and strand the row in Processing until the reaper times it out
   * 10 minutes later, burning a retry attempt for nothing. The retry route
   * passes true here to skip that redundant (and wrong) transition.
   */
  skipStartTransition?: boolean;
  deps?: IngestionDeps;
}

function buildDefaultDeps(supabase: SupabaseClient<Database>): IngestionDeps {
  return {
    extraction: {
      ...defaultExtractionDeps,
      downloadStorageObject: async (path) => {
        const { data, error } = await supabase.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(path);
        if (error || !data) throw error ?? new Error("Storage download returned no data");
        return Buffer.from(await data.arrayBuffer());
      },
    },
    embedTexts,
  };
}

/**
 * SPEC-CORE-008 NC-020, AC-002/AC-003: the ingestion chokepoint (mirrors
 * syncReminderForTarget's role in src/lib/api/reminders.ts) — the only
 * place that drives a knowledge_sources row from Pending/Failed through to
 * Ready or Failed. Used by both the create route's after() (default
 * options: performs the Pending -> Processing transition itself) and the
 * retry route's after() ({ skipStartTransition: true }, since
 * retry_knowledge_import already made that transition). `supabase` must be
 * a service-role client (src/lib/supabase/service.ts) since
 * start/complete/fail_knowledge_import are service_role-only RPCs.
 */
export async function processKnowledgeImport(
  supabase: SupabaseClient<Database>,
  sourceId: string,
  options: ProcessKnowledgeImportOptions = {},
): Promise<void> {
  const deps = options.deps ?? buildDefaultDeps(supabase);

  if (!options.skipStartTransition) {
    const { data: started, error: startError } = await supabase.rpc("start_knowledge_import", { p_source_id: sourceId });
    if (startError) {
      console.error(`start_knowledge_import failed for source ${sourceId}`, startError);
      return;
    }
    if (!started) return; // CAS no-op: already Processing/Ready/Failed, nothing to do
  }

  try {
    const { data: row, error: fetchError } = await supabase.from("knowledge_sources").select("*").eq("id", sourceId).single();
    if (fetchError || !row) throw fetchError ?? new Error("Source row disappeared mid-processing");

    // Security-review finding: storage_object_path is client-insertable
    // (the INSERT grant only checks auth.uid() = user_id, not this column)
    // and this client is service-role, which bypasses the Storage RLS that
    // would otherwise stop a cross-user download. Defense-in-depth on top
    // of the DB-level CHECK constraint added in 0007_knowledge_base.sql:
    // never download a path that doesn't live under this row's own user_id
    // prefix, regardless of how the row's storage_object_path was written.
    if (row.storage_object_path && !row.storage_object_path.startsWith(`${row.user_id}/`)) {
      throw new Error("storage_object_path does not belong to this source's owner");
    }

    // machineExtracted (NC-023) is threaded through extraction for Phase 3's
    // knowledge_lookup answer-composition to label with — nothing in this
    // phase's storage layer needs to persist it separately from the text.
    const { text } = await extractSourceContent(row as KnowledgeSourceRow, deps.extraction);

    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No content to chunk after extraction");
    if (chunks.length > KNOWLEDGE_MAX_CHUNKS_PER_SOURCE) {
      throw new Error(`Content produced ${chunks.length} chunks, exceeding the ${KNOWLEDGE_MAX_CHUNKS_PER_SOURCE} limit`);
    }

    const embeddings = await deps.embedTexts(chunks);
    if (embeddings.length !== chunks.length) throw new Error("Embedding count did not match chunk count");

    const payloadChunks = chunks.map((chunk_text, index) => ({
      chunk_index: index,
      chunk_text,
      embedding: embeddings[index],
    }));

    // NC-020: single atomic completion — replaces any prior chunk set and
    // flips status to Ready in one transaction, never separate calls.
    const { data: completed, error: completeError } = await supabase.rpc("complete_knowledge_import", {
      p_source_id: sourceId,
      p_raw_content: text,
      p_chunks: payloadChunks,
    });
    if (completeError || !completed) throw completeError ?? new Error("complete_knowledge_import returned false");
  } catch (error) {
    // NC-API-004 pattern: log the real error server-side; store only a
    // generic message the owning user can read back (never leaks fetch
    // targets, storage paths, or vendor error internals).
    console.error(`Knowledge import failed for source ${sourceId}`, error);
    const { error: failError } = await supabase.rpc("fail_knowledge_import", {
      p_source_id: sourceId,
      p_error_message: "Import failed. You can retry it or delete and re-import.",
    });
    if (failError) console.error(`fail_knowledge_import also failed for source ${sourceId}`, failError);
  }
}
