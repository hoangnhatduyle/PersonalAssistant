import { fileTypeFromBuffer } from "file-type";
import { TASK_ATTACHMENT_MAX_BYTES } from "@/lib/attachments/constants";

export interface AttachmentUploadValidationResult {
  valid: boolean;
  reason?: string;
  mimeType: string;
}

// Attachments accept arbitrary file kinds (unlike Knowledge's narrow
// image/video/audio allow-list), so this blocks executable/script container
// formats specifically rather than allow-listing everything else.
const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-mach-binary",
  "application/x-elf",
  "application/x-sh",
  "application/x-bat",
]);

/**
 * Request-time upload validation, mirroring
 * src/lib/knowledge/upload-guard.ts's magic-byte sniff + size cap — adapted
 * from an allow-list to a block-list since attachments have no closed set
 * of acceptable kinds. Not every legitimate attachment (plain text, CSV,
 * markdown, JSON, ...) has a magic-byte signature file-type can read; those
 * fall back to the browser-declared Content-Type rather than being rejected.
 */
export async function validateAttachmentUpload(bytes: Buffer, declaredMimeType: string): Promise<AttachmentUploadValidationResult> {
  if (bytes.length === 0) return { valid: false, reason: "Empty file", mimeType: declaredMimeType };
  if (bytes.length > TASK_ATTACHMENT_MAX_BYTES) {
    return { valid: false, reason: `File exceeds the ${TASK_ATTACHMENT_MAX_BYTES} byte limit`, mimeType: declaredMimeType };
  }

  const detected = await fileTypeFromBuffer(bytes);
  if (detected && BLOCKED_MIME_TYPES.has(detected.mime)) {
    return { valid: false, reason: `Attachments of type ${detected.mime} are not allowed`, mimeType: detected.mime };
  }

  return { valid: true, mimeType: detected?.mime ?? declaredMimeType };
}
