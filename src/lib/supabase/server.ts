import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { AuthUser, SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./types";

/** Always create a new client per request — never share one across requests. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // proxy.ts refreshes the session on every request, so this is
          // safe to ignore as long as it's still wired up.
        }
      },
    },
  });
}

/**
 * SPEC-API-004 NC-API-001: the app layer must verify the authenticated user
 * itself rather than relying on RLS alone. Route handlers call this — never
 * `getSession()`, which trusts the (possibly stale/forged) cookie payload
 * without revalidating it against Supabase Auth.
 */
export async function getAuthenticatedUser(supabase: SupabaseClient<Database>): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}
