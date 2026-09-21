import { computeTargetSize } from "@/lib/library/image-sizing";

/**
 * Vercel rejects request bodies over ~4.5MB, and phone screenshots/photos
 * routinely exceed that. The server re-encodes to 1600px WebP anyway, so
 * the browser only needs to get the upload comfortably under the limit:
 * downscale to ~2400px and re-encode. Files already small enough pass
 * through untouched.
 */
export const CLIENT_MAX_EDGE = 2400;
export const CLIENT_SKIP_BELOW_BYTES = 3_000_000;
const CLIENT_QUALITY = 0.85;

export class ImagePrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePrepareError";
  }
}

function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file).catch(() => {
    throw new ImagePrepareError(
      /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? "HEIC photos aren't supported — export as JPEG or PNG first"
        : "That image couldn't be read",
    );
  });
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const bitmap = await loadBitmap(file);
  try {
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height, CLIENT_MAX_EDGE);
    const needsResize = width !== bitmap.width || height !== bitmap.height;
    if (!needsResize && file.size < CLIENT_SKIP_BELOW_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImagePrepareError("Image processing isn't available in this browser");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", CLIENT_QUALITY));
    if (!blob) throw new ImagePrepareError("That image couldn't be processed");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: blob.type || "image/webp" });
  } finally {
    bitmap.close();
  }
}
