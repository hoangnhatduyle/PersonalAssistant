import { Worker } from "node:worker_threads";
import path from "node:path";
import {
  KNOWLEDGE_MAX_AUDIO_DURATION_SECONDS,
  KNOWLEDGE_MAX_IMAGE_DIMENSION_PX,
  KNOWLEDGE_MAX_VIDEO_DURATION_SECONDS,
  KNOWLEDGE_MAX_VIDEO_FRAME_COUNT,
  KNOWLEDGE_WORKER_MAX_OLD_GEN_MB,
  KNOWLEDGE_WORKER_MAX_YOUNG_GEN_MB,
  KNOWLEDGE_WORKER_TIMEOUT_MS,
} from "@/lib/knowledge/constants";

export type MediaWorkerSourceType = "image" | "video" | "audio";

export interface MediaExtractionInput {
  sourceType: MediaWorkerSourceType;
  bytes: Buffer;
}

export interface MediaExtractionResult {
  /** For video, the extracted audio track; for audio/image, the validated original bytes. */
  bytes: Buffer;
  mimeType: string;
}

export interface RunMediaExtractionFn {
  (input: MediaExtractionInput): Promise<MediaExtractionResult>;
}

type WorkerMessage = { ok: true; bytes: Buffer; mimeType: string } | { ok: false; reason: string };

// Plain-JS worker loaded by absolute path from disk (see extract-worker.mjs's
// header comment for why) — not a static import, so Next's bundler never
// touches it. NOTE for deployment: on a file-tracing serverless platform
// (e.g. Vercel), this path plus the ffmpeg/ffprobe binaries under
// node_modules must be included via outputFileTracingIncludes, since nothing
// statically references them.
const WORKER_PATH = path.join(process.cwd(), "src", "lib", "knowledge", "media-worker", "extract-worker.mjs");

/**
 * SPEC-INFRA-007 NC-INF-010: spawns a dedicated worker_threads instance with
 * an enforced heap bound (resourceLimits) and a wall-clock timeout that
 * terminates the thread on hang/crash — fault containment for parsing
 * untrusted uploaded bytes, not OS-level process isolation (unavailable in
 * this runtime). AC-003: a crafted file designed to hang/balloon memory
 * surfaces as a rejected promise, never an unbounded resource consumer.
 */
export const runMediaExtraction: RunMediaExtractionFn = (input) => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // turbopackIgnore/webpackIgnore: this must load purely at runtime from
    // disk, not get bundled — Turbopack (and webpack) otherwise special-case
    // `new Worker(...)` the same way they do `import()`, and try to trace
    // and bundle the worker file's own deps (fluent-ffmpeg's installer
    // packages use dynamic `require()`s to locate a platform binary, which
    // a static bundler can't resolve and fails the build on).
    const worker = new Worker(/* turbopackIgnore: true */ /* webpackIgnore: true */ WORKER_PATH, {
      workerData: {
        sourceType: input.sourceType,
        buffer: input.bytes,
        limits: {
          maxImageDimensionPx: KNOWLEDGE_MAX_IMAGE_DIMENSION_PX,
          maxVideoDurationSeconds: KNOWLEDGE_MAX_VIDEO_DURATION_SECONDS,
          maxVideoFrameCount: KNOWLEDGE_MAX_VIDEO_FRAME_COUNT,
          maxAudioDurationSeconds: KNOWLEDGE_MAX_AUDIO_DURATION_SECONDS,
        },
      },
      resourceLimits: {
        maxOldGenerationSizeMb: KNOWLEDGE_WORKER_MAX_OLD_GEN_MB,
        maxYoungGenerationSizeMb: KNOWLEDGE_WORKER_MAX_YOUNG_GEN_MB,
      },
    });

    const timeout = setTimeout(() => {
      settle(() => reject(new Error("Media extraction timed out")));
      worker.terminate();
    }, KNOWLEDGE_WORKER_TIMEOUT_MS);

    worker.once("message", (message: WorkerMessage) => {
      clearTimeout(timeout);
      settle(() => {
        if (message.ok) {
          resolve({ bytes: Buffer.from(message.bytes), mimeType: message.mimeType });
        } else {
          reject(new Error(message.reason));
        }
      });
      worker.terminate();
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      settle(() => reject(error));
    });
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      // TypeScript-review finding: this must settle whenever nothing else
      // has, regardless of exit code — the old `if (code !== 0)` gate meant
      // a clean exit (code 0) with no prior "message" (e.g. postMessage
      // failing silently, or a future code path in extract-worker.mjs that
      // returns without calling reply()) left this promise unsettled
      // forever, even though clearTimeout() had already cancelled the one
      // backstop that would have caught it. settle() is idempotent, so this
      // is a guaranteed no-op on every path that already resolved/rejected.
      settle(() => reject(new Error(`Media extraction worker exited (code ${code}) without a result`)));
    });
  });
};
