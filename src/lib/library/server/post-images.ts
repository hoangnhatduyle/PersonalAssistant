import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryPostImage } from "@/lib/api/entity-types";
import { LIBRARY_POST_IMAGE_BUCKET, MAX_IMAGES_PER_POST } from "@/lib/library/constants";
import { LibraryImageError, processLibraryImage } from "@/lib/library/image-pipeline";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/** Signed URLs are short-lived; the file route's redirect cache is deliberately shorter (see route). */
export const SIGNED_URL_TTL_SECONDS = 900;

export type AddImageResult =
  | { ok: true; image: LibraryPostImage }
  | { ok: false; reason: "not_found" | "limit_reached" }
  | { ok: false; reason: "invalid_image"; message: string };

/**
 * Validates + re-encodes one screenshot and attaches it to a post. Order
 * mirrors src/app/api/task-attachments/route.ts: check ownership -> process
 * -> upload both objects -> insert the row -> clean the objects up if the
 * insert fails (a row can't exist without bytes, and bytes without a row
 * would be orphaned forever).
 */
export async function addImage(supabase: Client, userId: string, postId: string, bytes: Buffer): Promise<AddImageResult> {
  const { data: post, error: postError } = await supabase
    .from("library_posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (postError) throw postError;
  if (!post) return { ok: false, reason: "not_found" };

  const { data: existing, error: existingError } = await supabase
    .from("library_post_images")
    .select("position")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("position", { ascending: false });
  if (existingError) throw existingError;
  if ((existing ?? []).length >= MAX_IMAGES_PER_POST) return { ok: false, reason: "limit_reached" };
  const nextPosition = (existing?.[0]?.position ?? -1) + 1;

  let processed;
  try {
    processed = await processLibraryImage(bytes);
  } catch (error) {
    if (error instanceof LibraryImageError) return { ok: false, reason: "invalid_image", message: error.message };
    throw error;
  }

  const base = `${userId}/${randomUUID()}`;
  const storagePath = `${base}.webp`;
  const thumbPath = `${base}.thumb.webp`;
  const bucket = supabase.storage.from(LIBRARY_POST_IMAGE_BUCKET);

  const fullUpload = await bucket.upload(storagePath, processed.full, { contentType: "image/webp", upsert: false });
  if (fullUpload.error) throw fullUpload.error;
  const thumbUpload = await bucket.upload(thumbPath, processed.thumb, { contentType: "image/webp", upsert: false });
  if (thumbUpload.error) {
    await bucket.remove([storagePath]);
    throw thumbUpload.error;
  }

  const { data: image, error: insertError } = await supabase
    .from("library_post_images")
    .insert({
      user_id: userId,
      post_id: postId,
      storage_path: storagePath,
      thumb_path: thumbPath,
      mime_type: "image/webp",
      width: processed.width,
      height: processed.height,
      size_bytes: processed.full.length,
      position: nextPosition,
    })
    .select("*")
    .single();
  if (insertError) {
    const { error: cleanupError } = await bucket.remove([storagePath, thumbPath]);
    if (cleanupError) console.error("Failed to clean up orphaned library image objects after insert failure", cleanupError);
    throw insertError;
  }

  return { ok: true, image };
}

/** Soft delete; the Storage bytes are retained (repo convention — no purge yet). */
export async function deleteImage(supabase: Client, userId: string, imageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_post_images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", imageId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Signed URL for a live image of a live post the caller owns, or null.
 * Deliberately no `download` option: the URL is used as an inline <img>
 * source, not a file download.
 */
export async function getImageSignedUrl(
  supabase: Client,
  userId: string,
  imageId: string,
  size: "thumb" | "full",
): Promise<string | null> {
  const { data: image, error } = await supabase
    .from("library_post_images")
    .select("storage_path, thumb_path, post:library_posts!inner(id, deleted_at)")
    .eq("id", imageId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("post.deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!image) return null;

  const path = size === "thumb" ? image.thumb_path : image.storage_path;
  const { data: signed, error: signError } = await supabase.storage
    .from(LIBRARY_POST_IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;
  return signed.signedUrl;
}
