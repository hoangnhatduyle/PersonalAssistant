/**
 * SPEC-CORE-008 NC-022/NC-027 pattern (KNOWLEDGE_MAX_RETRY_ATTEMPTS,
 * KNOWLEDGE_RELEVANCE_THRESHOLD, KNOWLEDGE_TOP_K pinned as named constants
 * rather than left implied): every tunable this phase's ingestion/upload/
 * fetch/rate-limit code depends on lives here, concretely pinned from the
 * start per the same rationale VOICE_CONFIDENCE_BAR is pinned in
 * src/lib/voice/transitions.ts.
 */

// Chunking (embeddings.ts/chunking.ts). Sized for text-embedding-3-small's
// context window with headroom; overlap keeps a sentence spanning a chunk
// boundary retrievable from either side.
export const KNOWLEDGE_CHUNK_SIZE_CHARS = 1200;
export const KNOWLEDGE_CHUNK_OVERLAP_CHARS = 150;
export const KNOWLEDGE_EMBEDDING_MODEL = "text-embedding-3-small";
export const KNOWLEDGE_VISION_MODEL = "gpt-4o-mini";
// Security-review finding: an unbounded chunk count sends one massive
// embeddings.create call (risking OpenAI's per-request token/array-size
// limits) and a many-MB complete_knowledge_import RPC payload. Batches
// embedding calls and caps total chunks per source so a huge input fails
// fast with a specific reason instead of deterministically failing at the
// embedding call on every one of its 3 retry attempts.
export const KNOWLEDGE_EMBEDDING_BATCH_SIZE = 96;
export const KNOWLEDGE_MAX_CHUNKS_PER_SOURCE = 500;
export const KNOWLEDGE_MAX_PASTED_TEXT_CHARS = 200_000;
export const KNOWLEDGE_MAX_TITLE_CHARS = 200;

// SPEC-API-008 NC-API-011/SPEC-CORE-008 NC-017: URL-fetch SSRF defense.
export const KNOWLEDGE_FETCH_MAX_REDIRECTS = 5;
export const KNOWLEDGE_FETCH_MAX_BYTES = 5_000_000; // 5MB of page text
export const KNOWLEDGE_FETCH_TIMEOUT_MS = 15_000;
export const KNOWLEDGE_FETCH_ALLOWED_CONTENT_TYPES = ["text/html", "text/plain"];

// SPEC-API-008 NC-API-012: request-time upload caps, per source_type.
export const KNOWLEDGE_UPLOAD_MAX_BYTES: Record<"image" | "video" | "audio", number> = {
  image: 10_000_000, // 10MB
  video: 200_000_000, // 200MB
  audio: 50_000_000, // 50MB
};

// SPEC-INFRA-007 NC-INF-010: decoded-resource bounds, enforced in the worker.
export const KNOWLEDGE_MAX_IMAGE_DIMENSION_PX = 8000;
export const KNOWLEDGE_MAX_VIDEO_DURATION_SECONDS = 1800; // 30 minutes
export const KNOWLEDGE_MAX_VIDEO_FRAME_COUNT = 100_000;
export const KNOWLEDGE_MAX_AUDIO_DURATION_SECONDS = 3600; // 60 minutes

// SPEC-INFRA-007 NC-INF-010: worker_threads fault containment.
export const KNOWLEDGE_WORKER_TIMEOUT_MS = 120_000; // 2 minutes
export const KNOWLEDGE_WORKER_MAX_OLD_GEN_MB = 512;
export const KNOWLEDGE_WORKER_MAX_YOUNG_GEN_MB = 64;

// SPEC-API-008 NC-API-018: create-route-specific rate limit (fans out to
// paid OpenAI/Deepgram calls).
export const KNOWLEDGE_CREATE_RATE_LIMIT_MAX = 10;
export const KNOWLEDGE_CREATE_RATE_LIMIT_WINDOW_MINUTES = 10;

// Supabase Storage bucket for uploaded file bytes (SPEC-INFRA-007 NC-INF-009).
export const KNOWLEDGE_STORAGE_BUCKET = "knowledge-uploads";

// SPEC-CORE-008 NC-027: knowledge_lookup retrieval tuning. Pinned as named
// constants from the start (mirrors VOICE_CONFIDENCE_BAR in
// src/lib/voice/transitions.ts) rather than left as an implied threshold —
// AC-005's citation invariant and AC-006's "no relevant chunks" response are
// only testable against a concrete cutoff.
export const KNOWLEDGE_RELEVANCE_THRESHOLD = 0.75;
export const KNOWLEDGE_TOP_K = 8;

// SPEC-API-008 shared_schemas KnowledgeSourceResponse: the exact column set
// client-facing routes select. Deliberately excludes raw_content (the full
// extracted document — unbounded size, not part of the pinned response
// shape) and storage_object_path (internal addressing, not client-useful
// and unnecessary exposure of ingestion internals).
export const KNOWLEDGE_SOURCE_PUBLIC_COLUMNS =
  "id, source_type, title, origin_url, status, error_message, attempt_count, created_at, updated_at";
