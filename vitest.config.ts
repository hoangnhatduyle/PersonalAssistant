import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // evals/** is a live assistant eval: it needs a real OPENAI_API_KEY and a
    // running local Supabase, and costs money per run. Excluded here so the
    // ordinary unit-test run stays hermetic -- run it via `bash evals/run.sh`.
    exclude: ["e2e/**", "evals/**", "node_modules/**", ".next/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
