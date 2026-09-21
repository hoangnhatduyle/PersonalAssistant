// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LibraryImageError, processLibraryImage } from "@/lib/library/image-pipeline";

async function makeImage(width: number, height: number, format: "png" | "jpeg" | "webp" = "png"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .toFormat(format)
    .toBuffer();
}

describe("processLibraryImage", () => {
  it("re-encodes to WebP, fitting 1600px full and 480px thumb", async () => {
    const result = await processLibraryImage(await makeImage(3200, 1600));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);

    const full = await sharp(result.full).metadata();
    const thumb = await sharp(result.thumb).metadata();
    expect(full.format).toBe("webp");
    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBe(480);
    expect(thumb.height).toBe(240);
  });

  it("never enlarges a small image", async () => {
    const result = await processLibraryImage(await makeImage(200, 100, "jpeg"));
    expect(result).toMatchObject({ width: 200, height: 100 });
    expect((await sharp(result.thumb).metadata()).width).toBe(200);
  });

  it("strips EXIF metadata (incl. GPS) and applies orientation", async () => {
    const withExif = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#123456" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processLibraryImage(withExif);
    expect((await sharp(result.full).metadata()).exif).toBeUndefined();
    // orientation 6 = rotate 90deg, so 400x200 becomes 200x400
    expect(result).toMatchObject({ width: 200, height: 400 });
  });

  it("rejects non-images by content, whatever the name says", async () => {
    await expect(processLibraryImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).rejects.toBeInstanceOf(LibraryImageError);
    await expect(processLibraryImage(Buffer.from("just text"))).rejects.toThrow(/JPEG, PNG and WebP/);
  });

  it("rejects gif (not on the allow-list)", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
    await expect(processLibraryImage(gif)).rejects.toThrow(/JPEG, PNG and WebP/);
  });

  it("rejects empty and oversized uploads", async () => {
    await expect(processLibraryImage(Buffer.alloc(0))).rejects.toThrow(/Empty/);
    await expect(processLibraryImage(Buffer.alloc(4_000_001, 1))).rejects.toThrow(/too large/);
  });

  it("rejects a truncated image with a user-safe message", async () => {
    const png = await makeImage(500, 500);
    await expect(processLibraryImage(png.subarray(0, 60))).rejects.toBeInstanceOf(LibraryImageError);
  });
});
