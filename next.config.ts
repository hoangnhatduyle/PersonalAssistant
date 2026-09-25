import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SPEC-INFRA-007: these are only ever required at runtime from inside
  // src/lib/knowledge/media-worker/extract-worker.mjs, a worker_threads
  // entry file loaded by absolute path (never a static import) — bundling
  // them fails the build, since @ffmpeg-installer/@ffprobe-installer locate
  // their platform binary via a dynamic `require()` no static bundler can
  // resolve. `sharp` is already externalized by Next's own default list.
  //
  // `jsdom` (pulled in by isomorphic-dompurify, used to sanitize email HTML
  // — see sanitize-email-html.ts) must also stay external: bundling it drags
  // in html-encoding-sniffer -> @exodus/bytes, an ESM-only package that
  // Turbopack's require() interop can't load, throwing ERR_REQUIRE_ESM at
  // runtime on every /api/mail/messages/[id] request in production.
  serverExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "@ffprobe-installer/ffprobe", "file-type", "jsdom"],
};

export default nextConfig;
