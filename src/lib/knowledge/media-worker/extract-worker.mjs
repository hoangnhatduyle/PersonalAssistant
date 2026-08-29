// SPEC-INFRA-007 NC-INF-010: this file runs inside a dedicated
// worker_threads instance (spawned by run-in-worker.ts), never on the main
// request-handling thread. It only ever does local parsing/probing/
// transcoding of untrusted bytes — it makes no network call.
//
// Plain ESM JS (not TS) on purpose: worker_threads loads this file directly
// via Node's own module resolution from an absolute path, bypassing Next.js's
// webpack/Turbopack bundle entirely, which sidesteps having to get a
// TS-compiled `new Worker(new URL(...))` reference correctly bundled by
// Next's server build. `file-type` is an ESM-only package, hence `.mjs`
// (unconditionally ESM regardless of the project's own package.json "type").
import { parentPort, workerData } from "node:worker_threads";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const ALLOWED_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/webm", "audio/mp4", "audio/x-m4a", "audio/ogg"],
};

function reply(message) {
  parentPort.postMessage(message);
}

// Security-review finding: fluent-ffmpeg spawns ffmpeg/ffprobe as separate
// OS processes (child_process.spawn), which worker_threads' resourceLimits
// and worker.terminate() (run-in-worker.ts's outer backstop) do NOT reach —
// terminating this worker thread does not kill an already-spawned ffmpeg/
// ffprobe child, and a hang there would otherwise run until the process
// itself gives up. Gives each ffmpeg/ffprobe operation its own timeout that
// explicitly kills the child process (command.kill()) and rejects normally
// (so the `finally` temp-dir cleanup below still runs, unlike an external
// worker.terminate() which gives no chance for in-worker cleanup code to
// execute at all) well before that outer backstop would ever fire.
const FFMPEG_OPERATION_TIMEOUT_MS = 90_000;

function withProcessTimeout(command, run) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      command.kill("SIGKILL");
      reject(new Error("ffmpeg/ffprobe operation timed out"));
    }, FFMPEG_OPERATION_TIMEOUT_MS);

    run(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function probe(filePath) {
  const command = ffmpeg(filePath);
  return withProcessTimeout(command, (resolve, reject) => {
    command.ffprobe(0, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

function extractAudioTrack(inputPath, outputPath) {
  const command = ffmpeg(inputPath).noVideo().audioCodec("pcm_s16le").format("wav");
  return withProcessTimeout(command, (resolve, reject) => {
    command.on("end", resolve).on("error", reject).save(outputPath);
  });
}

async function handleImage(bytes, mimeType, limits) {
  // NC-INF-010: sharp's own default limitInputPixels stays enabled here as
  // a decompression-bomb safety net in addition to our explicit bound below.
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) {
    return { ok: false, reason: "Could not read image dimensions" };
  }
  if (metadata.width > limits.maxImageDimensionPx || metadata.height > limits.maxImageDimensionPx) {
    return { ok: false, reason: "Image dimensions exceed the allowed bound" };
  }
  return { ok: true, bytes, mimeType };
}

async function handleVideoOrAudio(sourceType, bytes, mimeType, extension, limits) {
  const dir = await mkdtemp(path.join(tmpdir(), "knowledge-media-"));
  const inputPath = path.join(dir, `input.${extension}`);
  try {
    await writeFile(inputPath, bytes);
    const metadata = await probe(inputPath);
    const isVideo = sourceType === "video";
    const primaryStream = metadata.streams?.find((s) => s.codec_type === (isVideo ? "video" : "audio"));
    const duration = Number(metadata.format?.duration ?? primaryStream?.duration ?? 0);
    const maxDuration = isVideo ? limits.maxVideoDurationSeconds : limits.maxAudioDurationSeconds;
    if (!(duration > 0) || duration > maxDuration) {
      return { ok: false, reason: "Media duration exceeds the allowed bound (or could not be determined)" };
    }

    if (!isVideo) {
      return { ok: true, bytes, mimeType };
    }

    // Best-effort: nb_frames is often absent unless the container carries it
    // (many don't without a full decode pass) — duration is the primary
    // bound; this only catches an unusually high frame rate within it.
    const frameCount = Number(primaryStream?.nb_frames ?? NaN);
    if (Number.isFinite(frameCount) && frameCount > limits.maxVideoFrameCount) {
      return { ok: false, reason: "Video frame count exceeds the allowed bound" };
    }

    const hasAudioTrack = metadata.streams?.some((s) => s.codec_type === "audio");
    if (!hasAudioTrack) {
      return { ok: false, reason: "Video has no audio track to transcribe" };
    }

    const outputPath = path.join(dir, "audio.wav");
    await extractAudioTrack(inputPath, outputPath);
    const audioBytes = await readFile(outputPath);
    return { ok: true, bytes: audioBytes, mimeType: "audio/wav" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const { sourceType, buffer, limits } = workerData;
  const bytes = Buffer.from(buffer);

  // Re-validates container/format against the declared allow-list before
  // invoking any parser — never trusting the declared MIME/extension alone,
  // in addition to (not instead of) SPEC-API-008's request-time check.
  // TypeScript-review finding: the caller's declaredMimeType (a guess from
  // source_type alone, e.g. always "audio/mpeg") must never override the
  // actually-sniffed `detected.mime` here — it previously did via `??`,
  // which is always false-y-skipped since declaredMimeType is never empty,
  // so a real WAV/OGG/M4A upload was mislabeled audio/mpeg all the way to
  // Deepgram. detected.mime is authoritative for every branch below.
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !ALLOWED_MIME_TYPES[sourceType]?.includes(detected.mime)) {
    reply({ ok: false, reason: "Worker-time container/format validation failed" });
    return;
  }

  if (sourceType === "image") {
    reply(await handleImage(bytes, detected.mime, limits));
    return;
  }
  reply(await handleVideoOrAudio(sourceType, bytes, detected.mime, detected.ext, limits));
}

main().catch((error) => {
  reply({ ok: false, reason: error instanceof Error ? error.message : "Unknown media-worker error" });
});
