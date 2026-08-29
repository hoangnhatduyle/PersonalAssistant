import type { Database } from "@/lib/supabase/types";
import { fetchUrlPinned, type PinnedFetchResult } from "@/lib/knowledge/ssrf-fetch";
import { extractReadableText } from "@/lib/knowledge/html-extract";
import { type DescribeImageFn, describeImage } from "@/lib/knowledge/vision";
import type { TranscribeFn } from "@/lib/voice/deepgram";
import { transcribeAudio } from "@/lib/voice/deepgram";
import { type RunMediaExtractionFn, runMediaExtraction } from "@/lib/knowledge/media-worker/run-in-worker";

export type KnowledgeSourceRow = Database["public"]["Tables"]["knowledge_sources"]["Row"];

export interface ExtractionResult {
  text: string;
  /** SPEC-CORE-008 NC-023: OCR/transcript-derived content must be labeled. */
  machineExtracted: boolean;
}

export interface ExtractionDeps {
  fetchUrl: (url: string) => Promise<PinnedFetchResult>;
  describeImage: DescribeImageFn;
  transcribeAudio: TranscribeFn;
  runMediaExtraction: RunMediaExtractionFn;
  downloadStorageObject: (path: string) => Promise<Buffer>;
}

export const defaultExtractionDeps: ExtractionDeps = {
  fetchUrl: fetchUrlPinned,
  describeImage,
  transcribeAudio,
  runMediaExtraction,
  downloadStorageObject: async () => {
    throw new Error("downloadStorageObject must be provided by the caller (needs a Supabase client)");
  },
};

/**
 * SPEC-CORE-008: dispatches by source_type to produce the plain text that
 * ingestion.ts chunks and embeds. Only ever called by ingestion.ts.
 * `pasted_text` needs no extraction at all — the create route already wrote
 * the final text into raw_content at insert time (see the Phase 2 plan's
 * "no schema change needed for retry" note), so this just reads it back.
 */
export async function extractSourceContent(row: KnowledgeSourceRow, deps: ExtractionDeps): Promise<ExtractionResult> {
  switch (row.source_type) {
    case "pasted_text": {
      if (!row.raw_content) throw new Error("pasted_text source has no raw_content");
      return { text: row.raw_content, machineExtracted: false };
    }

    case "url": {
      if (!row.origin_url) throw new Error("url source has no origin_url");
      const fetched = await deps.fetchUrl(row.origin_url);
      const text = extractReadableText(fetched.body);
      if (!text) throw new Error("URL fetch produced no readable text");
      return { text, machineExtracted: false };
    }

    case "image": {
      if (!row.storage_object_path) throw new Error("image source has no storage_object_path");
      const bytes = await deps.downloadStorageObject(row.storage_object_path);
      const validated = await deps.runMediaExtraction({ sourceType: "image", bytes });
      const description = await deps.describeImage(validated.bytes, validated.mimeType);
      if (!description) throw new Error("Vision call produced no description");
      return { text: description, machineExtracted: true };
    }

    case "video":
    case "audio": {
      if (!row.storage_object_path) throw new Error(`${row.source_type} source has no storage_object_path`);
      const bytes = await deps.downloadStorageObject(row.storage_object_path);
      const extracted = await deps.runMediaExtraction({ sourceType: row.source_type, bytes });
      const transcript = await deps.transcribeAudio(extracted.bytes, extracted.mimeType);
      if (!transcript) throw new Error("Transcription produced no text");
      return { text: transcript, machineExtracted: true };
    }
  }
}
