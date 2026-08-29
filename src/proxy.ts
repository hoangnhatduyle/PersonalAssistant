import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request. Server Components
 * can only read cookies, never write them, so if a token refresh only ever
 * happened there, the browser would keep resending a stale refresh token
 * forever. Proxy runs before rendering and can write the Set-Cookie header.
 *
 * (Renamed from the deprecated `middleware.ts` convention — Next.js 16.)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // A refreshed session cookie must never end up in a shared CDN/edge
        // cache entry and get served to a different user.
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  // Revalidates against Supabase Auth (not just the cookie payload) and
  // writes back a refreshed session via setAll above if the token expired.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
