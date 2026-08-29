import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination } from "@/lib/api/pagination";
import { knowledgeSourceCreateFieldsSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, rateLimitedResponse, serverErrorResponse } from "@/lib/api/response";
import { checkCreateRateLimit } from "@/lib/knowledge/rate-limit";
import { validateUrlPreflight } from "@/lib/knowledge/ssrf-fetch";
import { validateUpload, type UploadSourceType } from "@/lib/knowledge/upload-guard";
import { runMediaExtraction } from "@/lib/knowledge/media-worker/run-in-worker";
import { KNOWLEDGE_SOURCE_PUBLIC_COLUMNS, KNOWLEDGE_STORAGE_BUCKET } from "@/lib/knowledge/constants";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processKnowledgeImport } from "@/lib/knowledge/ingestion";

// SPEC-INFRA-007 in-scope #1: ingestion runs inside this same invocation via
// after(), bounded by this route-segment maxDuration.
export const maxDuration = 300;

const KNOWLEDGE_STATUSES = ["Pending", "Processing", "Ready", "Failed"] as const;
type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
function isKnowledgeStatus(value: string): value is KnowledgeStatus {
  return (KNOWLEDGE_STATUSES as readonly string[]).includes(value);
}

/** GET /api/knowledge — list, scoped to the caller (NC-API-013). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);

  let query = supabase
    .from("knowledge_sources")
    .select(KNOWLEDGE_SOURCE_PUBLIC_COLUMNS, { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  const statusParam = searchParams.get("status");
  if (statusParam) {
    if (!isKnowledgeStatus(statusParam)) return validationErrorResponse(`Unknown status: ${statusParam}`);
    query = query.eq("status", statusParam);
  }

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("knowledge source list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

const FILE_SOURCE_TYPES = new Set(["image", "video", "audio"]);

/**
 * POST /api/knowledge — create (SPEC-API-008 shared_schemas KnowledgeSourcePayload).
 * Accepts multipart/form-data: source_type, title, and one of url/text/file.
 * Validates and (for a file) uploads to Storage BEFORE inserting the row —
 * knowledge_sources has no UPDATE grant at all (NC-DATA-025), so
 * storage_object_path must be known and included in the single INSERT, not
 * patched in afterward. Returns 201 with the source in Pending immediately;
 * extraction/embedding runs afterward via after(), never synchronously here.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  let rateLimit: { allowed: boolean };
  try {
    rateLimit = await checkCreateRateLimit(supabase, user.id);
  } catch (error) {
    return serverErrorResponse("rate limit check failed", error);
  }
  if (!rateLimit.allowed) return rateLimitedResponse();

  const formData = await request.formData().catch(() => null);
  if (!formData) return validationErrorResponse("Expected multipart/form-data");

  const parsed = knowledgeSourceCreateFieldsSchema.safeParse({
    source_type: formData.get("source_type"),
    title: formData.get("title"),
    url: formData.get("url") ?? undefined,
    text: formData.get("text") ?? undefined,
  });
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  const { source_type, title, url, text } = parsed.data;

  const file = formData.get("file");
  if (FILE_SOURCE_TYPES.has(source_type) && !(file instanceof File)) {
    return validationErrorResponse(`A file is required when source_type is "${source_type}"`);
  }

  let originUrl: string | null = null;
  let rawContent: string | null = null;
  let storageObjectPath: string | null = null;

  if (source_type === "url") {
    if (!url) return validationErrorResponse("url is required when source_type is \"url\"");
    // NC-API-011/AC-002: fast-fail, synchronous, before any Pending row exists.
    const validation = await validateUrlPreflight(url);
    if (!validation.valid) return validationErrorResponse(validation.reason ?? "Invalid URL");
    originUrl = url;
  } else if (source_type === "pasted_text") {
    if (!text) return validationErrorResponse("text is required when source_type is \"pasted_text\"");
    // No extraction needed later — this already is the final text.
    rawContent = text;
  } else {
    const bytes = Buffer.from(await (file as File).arrayBuffer());
    const validation = await validateUpload(bytes, source_type as UploadSourceType);
    if (!validation.valid) return validationErrorResponse(validation.reason ?? "Invalid file upload");

    // AC-004b: decoded-resource bounds (image pixel dimensions, video
    // duration/frame count) must reject with 400 synchronously too, not
    // just eventually during async processing — architect-review finding.
    // Runs the same worker_threads-sandboxed check the async pipeline will
    // run again during actual ingestion (retry needs to re-derive from
    // Storage independently anyway, so this duplicates work, not risk).
    try {
      await runMediaExtraction({ sourceType: source_type as UploadSourceType, bytes });
    } catch (error) {
      return validationErrorResponse(error instanceof Error ? error.message : "File failed validation");
    }

    storageObjectPath = `${user.id}/${randomUUID()}`;
    const { error: uploadError } = await supabase.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .upload(storageObjectPath, bytes, { contentType: validation.detectedMimeType, upsert: false });
    if (uploadError) return serverErrorResponse("knowledge source upload failed", uploadError);
  }

  const { data: created, error: insertError } = await supabase
    .from("knowledge_sources")
    .insert({ user_id: user.id, source_type, title, origin_url: originUrl, raw_content: rawContent, storage_object_path: storageObjectPath })
    .select(KNOWLEDGE_SOURCE_PUBLIC_COLUMNS)
    .single();
  if (insertError) {
    if (storageObjectPath) {
      const { error: cleanupError } = await supabase.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove([storageObjectPath]);
      if (cleanupError) console.error("Failed to clean up orphaned upload after insert failure", cleanupError);
    }
    return serverErrorResponse("knowledge source create failed", insertError);
  }

  const sourceId = created.id;
  after(() => processKnowledgeImport(createServiceRoleClient(), sourceId));

  return successResponse(created, { status: 201 });
}
