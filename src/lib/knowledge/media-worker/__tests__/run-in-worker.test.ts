// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runMediaExtraction } from "../run-in-worker";

// Traces: SPEC-INFRA-007 NC-INF-010. Exercises the real worker_threads
// mechanism end to end (spawn, sharp/file-type running inside the worker,
// postMessage back) rather than just type-checking it — this is the most
// novel, highest-risk piece of this phase (fault containment for untrusted
// uploaded bytes) and the one thing a mocked unit test can't actually prove
// works at runtime under Next's build (see next.config.ts's
// serverExternalPackages for why it needs that config at all).
describe("runMediaExtraction (real worker_threads)", () => {
  it("validates and passes through a genuine small image", async () => {
    const bytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 20, b: 20 } },
    })
      .png()
      .toBuffer();

    const result = await runMediaExtraction({ sourceType: "image", bytes });
    expect(result.mimeType).toBe("image/png");
    expect(result.bytes.length).toBeGreaterThan(0);
  }, 20_000);

  it("rejects bytes whose magic-byte signature doesn't match the declared type", async () => {
    const bytes = Buffer.from("this is not an image at all, just text");
    await expect(runMediaExtraction({ sourceType: "image", bytes })).rejects.toThrow();
  }, 20_000);
});
