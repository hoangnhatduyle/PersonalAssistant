import { afterEach, describe, expect, it, vi } from "vitest";

// Traces: SPEC-INFRA-004 AC-4/AC-5.
describe("env", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    vi.resetModules();
  });

  it("exposes the browser-safe Supabase URL and anon key", async () => {
    const { publicEnv } = await import("./env");
    expect(publicEnv.supabaseUrl).toBe(originalUrl);
    expect(publicEnv.supabaseAnonKey).toBe(originalAnonKey);
  });

  it("fails fast with a clear error when a required var is missing at boot", async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("requireEnv rejects any named var that isn't set, not just the known ones", async () => {
    const { requireEnv } = await import("./env");
    expect(() => requireEnv("SOME_VAR_THAT_IS_DEFINITELY_NOT_SET")).toThrow(
      /SOME_VAR_THAT_IS_DEFINITELY_NOT_SET/,
    );
  });
});
