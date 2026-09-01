import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

// Phase 4 auth guard (added alongside the pre-existing session refresh
// above): routes that render without a signed-in user.
const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // API routes self-enforce auth via requireAuthenticatedContext() and must
  // keep returning JSON 401s, never a redirect. /auth/* is the OAuth/PKCE
  // callback, which by definition runs before a session exists yet. Segment
  // boundary (not a bare startsWith prefix) so a future route like
  // /api-status or /authors can never silently fall through this guard.
  if (isPathOrUnderSegment(pathname, "/api") || isPathOrUnderSegment(pathname, "/auth")) {
    return response;
  }

  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (!user && !isPublicPath) {
    return redirectWithRefreshedCookies(new URL("/sign-in", request.url), response);
  }

  if (user && isPublicPath) {
    return redirectWithRefreshedCookies(new URL("/", request.url), response);
  }

  return response;
}

/**
 * NextResponse.redirect() builds a brand-new response carrying only a
 * Location header — any Set-Cookie/Cache-Control written onto `refreshed`
 * by the token-refresh block above would otherwise be silently dropped.
 * Without this, a user whose access token got rotated mid-request (e.g.
 * visiting /sign-in right as their token expires) would have the redirect
 * ship the OLD, now-invalidated refresh token, causing a spurious forced
 * logout on their very next request.
 */
function isPathOrUnderSegment(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

function redirectWithRefreshedCookies(url: URL, refreshed: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of refreshed.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  const cacheControl = refreshed.headers.get("Cache-Control");
  if (cacheControl) redirectResponse.headers.set("Cache-Control", cacheControl);
  return redirectResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
