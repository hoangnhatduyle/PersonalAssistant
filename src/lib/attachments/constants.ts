// Task Attachments (Phase 4 of the Trello-style card-detail modal). Pinned
// as named constants from the start, same rationale as
// src/lib/knowledge/constants.ts's KNOWLEDGE_UPLOAD_MAX_BYTES.

// Supabase Storage bucket for uploaded attachment bytes (kind='file' rows
// only — a 'link' row stores no bytes here). Hardcoded, no env var, same
// convention as KNOWLEDGE_STORAGE_BUCKET.
export const TASK_ATTACHMENT_STORAGE_BUCKET = "card-attachments";

// A single cap regardless of file type, unlike Knowledge's per-source_type
// table — attachments accept arbitrary file kinds, not a closed
// image/video/audio set.
export const TASK_ATTACHMENT_MAX_BYTES = 25_000_000; // 25MB

// How long a download route's signed URL stays valid before the redirect
// must land — generous enough for a slow connection to start the transfer,
// short enough that a copied/leaked link is useless soon after.
export const TASK_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60;
