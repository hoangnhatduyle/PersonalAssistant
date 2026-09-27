import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from the root config: this suite is a live eval (real OpenAI calls,
// real local Supabase), so it runs in node rather than jsdom, has no timeout,
// and is never picked up by the ordinary `vitest` run.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
  test: {
    root: __dirname,
    environment: "node",
    include: ["*.test.ts"],
    setupFiles: ["./setup.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
  },
});
