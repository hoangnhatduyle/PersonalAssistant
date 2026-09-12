import { NextResponse } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { TASK_ATTACHMENT_STORAGE_BUCKET, TASK_ATTACHMENT_SIGNED_URL_TTL_SECONDS } from "@/lib/attachments/constants";
import { notFoundResponse, serverErrorResponse } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/task-attachments/[id]/download — ownership-checked redirect to a
 * short-lived signed Storage URL. Attachments need to be browser-viewable
 * (unlike Knowledge source bytes, only ever consumed server-side by the
 * ingestion pipeline), so this is a first for the app: no other route signs
 * a Storage URL. A "link" attachment has no bytes here — the client links
 * straight to its own `url` field instead of hitting this route.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: attachment, error } = await supabase
    .from("task_attachments")
    .select("kind, title, storage_object_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return serverErrorResponse("attachment lookup failed", error);
  if (!attachment || attachment.kind !== "file" || !attachment.storage_object_path) return notFoundResponse();

  const { data: signed, error: signError } = await supabase.storage
    .from(TASK_ATTACHMENT_STORAGE_BUCKET)
    .createSignedUrl(attachment.storage_object_path, TASK_ATTACHMENT_SIGNED_URL_TTL_SECONDS, {
      download: attachment.title,
    });
  if (signError || !signed) return serverErrorResponse("attachment sign failed", signError ?? new Error("no signed URL returned"));

  return NextResponse.redirect(signed.signedUrl);
}
