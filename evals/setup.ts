import path from "node:path";

// The eval talks to the real OpenAI API and the local Supabase stack, so it
// needs the same .env.local the dev server uses. Vitest does not load it for a
// node-environment suite, hence the explicit load.
process.loadEnvFile(path.resolve(__dirname, "../.env.local"));
