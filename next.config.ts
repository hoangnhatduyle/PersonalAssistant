import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SPEC-INFRA-007: these are only ever required at runtime from inside
  // src/lib/knowledge/media-worker/extract-worker.mjs, a worker_threads
  // entry file loaded by absolute path (never a static import) — bundling
  // them fails the build, since @ffmpeg-installer/@ffprobe-installer locate
  // their platform binary via a dynamic `require()` no static bundler can
  // resolve. `sharp` is already externalized by Next's own default list.
  serverExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "@ffprobe-installer/ffprobe", "file-type"],
};

export default nextConfig;
