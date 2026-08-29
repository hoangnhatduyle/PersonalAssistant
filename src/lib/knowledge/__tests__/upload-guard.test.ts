// file-type's internal Uint8Array/instanceof checks break under jsdom's
// cross-realm globals (the project's default vitest environment) — run this
// file under the real Node environment instead.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateUpload } from "../upload-guard";
import { KNOWLEDGE_UPLOAD_MAX_BYTES } from "../constants";

// Minimal-but-real magic-byte fixtures — file-type sniffs actual signatures,
// so these need to be genuinely well-formed enough to detect, not just a
// couple of header bytes (a bare PNG signature with no IHDR chunk, for
// example, does not detect).
function pngBytes(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrLength = Buffer.from([0, 0, 0, 13]);
  const ihdrType = Buffer.from("IHDR");
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const crc = Buffer.alloc(4);
  return Buffer.concat([signature, ihdrLength, ihdrType, ihdrData, crc]);
}

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

// Traces: SPEC-API-008 NC-API-012, AC-004.
describe("validateUpload", () => {
  it("accepts a genuine PNG declared as an image", async () => {
    const result = await validateUpload(pngBytes(), "image");
    expect(result.valid).toBe(true);
    expect(result.detectedMimeType).toBe("image/png");
  });

  it("accepts a genuine JPEG declared as an image", async () => {
    const result = await validateUpload(jpegBytes(), "image");
    expect(result.valid).toBe(true);
  });

  it("rejects an empty file", async () => {
    const result = await validateUpload(Buffer.alloc(0), "image");
    expect(result.valid).toBe(false);
  });

  it("rejects a file whose magic bytes don't match any known type", async () => {
    const result = await validateUpload(Buffer.from("just some plain text, not a real file"), "image");
    expect(result.valid).toBe(false);
  });

  it("rejects a magic-byte/declared-type mismatch (a real JPEG declared as audio)", async () => {
    const result = await validateUpload(jpegBytes(), "audio");
    expect(result.valid).toBe(false);
    expect(result.detectedMimeType).toBe("image/jpeg");
  });

  it("rejects a file exceeding the per-type byte cap", async () => {
    const oversized = Buffer.concat([pngBytes(), Buffer.alloc(KNOWLEDGE_UPLOAD_MAX_BYTES.image)]);
    const result = await validateUpload(oversized, "image");
    expect(result.valid).toBe(false);
  });
});
