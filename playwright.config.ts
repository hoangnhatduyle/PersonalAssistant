import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Same .env.local the dev server reads, so specs can use the admin client
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) to seed and verify data.
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
