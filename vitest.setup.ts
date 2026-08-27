import "@testing-library/jest-dom/vitest";

try {
  process.loadEnvFile(".env.local");
} catch (error) {
  // .env.local is optional (e.g. CI providing real env vars directly) — but
  // only swallow "file not found"; a malformed file should fail loudly
  // instead of surfacing later as a confusing "SUPABASE_URL is not set".
  if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
    throw error;
  }
}
