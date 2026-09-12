import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { attachmentPayloadSchema } from "@/lib/api/schemas";
import { validateAttachmentUpload } from "@/lib/attachments/upload-guard";
import { TASK_ATTACHMENT_STORAGE_BUCKET } from "@/lib/attachments/constants";
import { successResponse, validationErrorResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * GET /api/task-attachments?taskId=... — list one card's attachments,
 * scoped to the caller (NC-API-001/AC-4, NC-API-007). taskId is required,
 * same shape as GET /api/checklist-items.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return validationErrorResponse("taskId is required");

  let query = supabase
    .from("task_attachments")
    .select("*")
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (!wantsIncludeDeleted(request.nextUrl.searchParams)) query = query.is("deleted_at", null);

  const { data, error } = await query;
  if (error) return serverErrorResponse("task attachments list failed", error);

  return successResponse(data);
}

/**
 * POST /api/task-attachments — create. JSON body for a "link" attachment;
 * multipart/form-data (task_id, kind, title, file) for a "file" one —
 * validated and uploaded to Storage BEFORE inserting the row (same
 * upload-then-insert-then-cleanup-on-failure ordering as
 * POST /api/knowledge), since task_attachments has no UPDATE grant on
 * storage_object_path (it's never client-settable at all). task_id must
 * reference a Task the caller owns (checked here;
 * guard_task_attachment_task_ownership backstops it —
 * supabase/migrations/0032_task_attachments.sql).
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const isMultipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");

  let file: File | null = null;
  let rawPayload: unknown;
  if (isMultipart) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return validationErrorResponse("Expected multipart/form-data");
    rawPayload = {
      task_id: formData.get("task_id"),
      kind: formData.get("kind"),
      title: formData.get("title"),
    };
    const maybeFile = formData.get("file");
    if (maybeFile instanceof File) file = maybeFile;
  } else {
    rawPayload = await request.json().catch(() => null);
  }

  const parsed = attachmentPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  const { task_id, kind, title, url } = parsed.data;

  if (kind === "file" && !file) return validationErrorResponse("A file is required when kind is \"file\"");

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", task_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (taskError) return serverErrorResponse("task lookup failed", taskError);
  if (!task) return notFoundResponse();

  let storageObjectPath: string | null = null;
  let fileSizeBytes: number | null = null;
  let mimeType: string | null = null;

  if (kind === "file" && file) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const validation = await validateAttachmentUpload(bytes, file.type || "application/octet-stream");
    if (!validation.valid) return validationErrorResponse(validation.reason ?? "Invalid file upload");

    storageObjectPath = `${user.id}/${randomUUID()}`;
    const { error: uploadError } = await supabase.storage
      .from(TASK_ATTACHMENT_STORAGE_BUCKET)
      .upload(storageObjectPath, bytes, { contentType: validation.mimeType, upsert: false });
    if (uploadError) return serverErrorResponse("attachment upload failed", uploadError);

    fileSizeBytes = bytes.length;
    mimeType = validation.mimeType;
  }

  const { data: created, error: insertError } = await supabase
    .from("task_attachments")
    .insert({
      user_id: user.id,
      task_id,
      kind,
      title,
      url: kind === "link" ? (url ?? null) : null,
      storage_object_path: storageObjectPath,
      file_size_bytes: fileSizeBytes,
      mime_type: mimeType,
    })
    .select("*")
    .single();
  if (insertError) {
    if (storageObjectPath) {
      const { error: cleanupError } = await supabase.storage.from(TASK_ATTACHMENT_STORAGE_BUCKET).remove([storageObjectPath]);
      if (cleanupError) console.error("Failed to clean up orphaned attachment upload after insert failure", cleanupError);
    }
    return serverErrorResponse("attachment create failed", insertError);
  }

  return successResponse(created, { status: 201 });
}
