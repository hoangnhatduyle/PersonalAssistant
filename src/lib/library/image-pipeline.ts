import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { KNOWLEDGE_MAX_IMAGE_DIMENSION_PX } from "@/lib/knowledge/constants";
import { FULL_MAX_EDGE, MAX_UPLOAD_BYTES, THUMB_MAX_EDGE } from "@/lib/library/constants";

// Allow-list (not the block-list in src/lib/attachments/upload-guard.ts):
// only formats sharp can decode safely and browsers can produce.
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const WEBP_QUALITY = 82;

export interface ProcessedLibraryImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

export class LibraryImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryImageError";
  }
}

async function resizeToWebp(bytes: Buffer, maxEdge: number): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes, { limitInputPixels: KNOWLEDGE_MAX_IMAGE_DIMENSION_PX ** 2 })
    .rotate() // apply EXIF orientation, then drop the metadata (webp() writes none) — strips EXIF/GPS
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Validates (magic-byte sniff, not the client's Content-Type) and
 * re-encodes an uploaded screenshot: EXIF/GPS stripped, WebP, 1600px full
 * + 480px thumbnail. Throws LibraryImageError with a user-safe message for
 * anything rejected.
 */
export async function processLibraryImage(bytes: Buffer): Promise<ProcessedLibraryImage> {
  if (bytes.length === 0) throw new LibraryImageError("Empty file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new LibraryImageError("Image is too large (max 4 MB)");

  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new LibraryImageError("Only JPEG, PNG and WebP images are supported");
  }

  try {
    const full = await resizeToWebp(bytes, FULL_MAX_EDGE);
    const thumb = await resizeToWebp(bytes, THUMB_MAX_EDGE);
    return { full: full.data, thumb: thumb.data, width: full.width, height: full.height };
  } catch (error) {
    console.error("library image decode failed", error);
    throw new LibraryImageError("That image could not be read");
  }
}
