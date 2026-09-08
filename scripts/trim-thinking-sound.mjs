// One-off generator: trims the TunePocket source track down to a loopable
// clip for src/lib/voice/thinking-sound.ts. The full preview has a spoken
// watermark starting around 17s, so this cuts at LOOP_SECONDS and bakes in
// short fades at both ends -- AudioBufferSourceNode's loop restart jumps
// straight from the last sample to the first with no crossfade of its own,
// so without these the loop would click/pop on every repeat. Re-run with
// `node scripts/trim-thinking-sound.mjs` if the source or cut point changes.
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(rootDir, "public", "sounds", "TunePocket-Happy-And-Quiet-Place-Preview.mp3");
const output = path.join(rootDir, "public", "sounds", "TunePocket-Happy-And-Quiet-Place-Loop.mp3");

const LOOP_SECONDS = 16;
const FADE_IN_SECONDS = 0.15;
const FADE_OUT_SECONDS = 0.35;

ffmpeg.setFfmpegPath(ffmpegPath.path);

ffmpeg(source)
  .setStartTime(0)
  .duration(LOOP_SECONDS)
  .audioFilters([
    `afade=t=in:st=0:d=${FADE_IN_SECONDS}`,
    `afade=t=out:st=${LOOP_SECONDS - FADE_OUT_SECONDS}:d=${FADE_OUT_SECONDS}`,
  ])
  .on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .on("end", () => {
    console.log(`Generated ${path.relative(rootDir, output)}`);
  })
  .save(output);
