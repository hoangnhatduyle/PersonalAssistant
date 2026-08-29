/**
 * SPEC-INFRA-004 AC-4/AC-5, NC-INF-005: the one place that distinguishes
 * browser-safe env (NEXT_PUBLIC_-prefixed) from server-only env.
 *
 * `publicEnv` is read eagerly so a missing value fails fast on any boot path
 * (server or client) per AC-4. Server-only keys (service role, voice vendor
 * keys, ...) are NOT collected into an eager object here — each is only
 * required once the specific server-only module that consumes it actually
 * needs it (via `requireEnv`), so a var not yet populated for a
 * not-yet-implemented feature doesn't block boot, and no server-only value
 * is ever read from a module reachable by the client bundle.
 */
function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * For server-only vars. Do NOT use this for NEXT_PUBLIC_ vars — Next.js only
 * inlines a static `process.env.NEXT_PUBLIC_X` member expression into the
 * client bundle, never a dynamic `process.env[name]` lookup, so a variable
 * name here would silently fail to resolve in the browser.
 */
export function requireEnv(name: string): string {
  return requireValue(process.env[name], name);
}

export const publicEnv = {
  supabaseUrl: requireValue(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: requireValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};
