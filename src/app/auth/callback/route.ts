import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * `next` must be a same-origin relative path, never used to build a raw
 * string concatenation. `?next=@evil.com` (or `//evil.com`) into
 * `${origin}${next}` was a real open redirect — browsers parse the "@" as
 * URL userinfo, landing on evil.com despite a successful, legitimate PKCE
 * exchange (Phase 4 security review finding). Reject anything that isn't a
 * plain in-app path.
 */
function safeNextPath(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

/** Supabase Auth session-refresh/PKCE callback (SPEC-API-004: auth session handling). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
