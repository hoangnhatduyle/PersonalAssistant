import { fileTypeFromBuffer } from "file-type";
import { KNOWLEDGE_UPLOAD_MAX_BYTES } from "@/lib/knowledge/constants";

export type UploadSourceType = "image" | "video" | "audio";

const ALLOWED_MIME_TYPES: Record<UploadSourceType, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/webm", "audio/mp4", "audio/x-m4a", "audio/ogg"],
};

export interface UploadValidationResult {
  valid: boolean;
  reason?: string;
  detectedMimeType?: string;
}

/**
 * SPEC-API-008 NC-API-012, AC-004: request-time upload validation — magic-byte
 * sniff (file-type reads the actual container header, not the client-supplied
 * Content-Type/extension) cross-checked against an allow-list per
 * source_type, plus a byte-size cap. Called by the create route before any
 * Pending row is inserted or any byte is uploaded to Storage. Decoded-resource
 * bounds (pixel dimensions, duration/frame count) are a separate,
 * worker-time check (src/lib/knowledge/media-worker) — this function only
 * ever looks at the compressed bytes on disk.
 */
export async function validateUpload(bytes: Buffer, sourceType: UploadSourceType): Promise<UploadValidationResult> {
  const maxBytes = KNOWLEDGE_UPLOAD_MAX_BYTES[sourceType];
  if (bytes.length === 0) return { valid: false, reason: "Empty file" };
  if (bytes.length > maxBytes) {
    return { valid: false, reason: `File exceeds the ${maxBytes} byte limit for ${sourceType} uploads` };
  }

  const detected = await fileTypeFromBuffer(bytes);
  if (!detected) {
    return { valid: false, reason: "Could not determine the file's actual type from its contents" };
  }
  if (!ALLOWED_MIME_TYPES[sourceType].includes(detected.mime)) {
    return { valid: false, reason: `Detected type ${detected.mime} is not allowed for ${sourceType} uploads`, detectedMimeType: detected.mime };
  }

  return { valid: true, detectedMimeType: detected.mime };
}
