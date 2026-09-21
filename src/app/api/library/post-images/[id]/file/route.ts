import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { notFoundResponse, serverErrorResponse } from "@/lib/api/response";
import { getImageSignedUrl } from "@/lib/library/server/post-images";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Redirect cache must stay shorter than the signed URL's lifetime
// (SIGNED_URL_TTL_SECONDS = 900) or a cached redirect could point at an
// expired URL.
const REDIRECT_CACHE_SECONDS = 300;

/**
 * GET /api/library/post-images/[id]/file?size=thumb|full — a stable,
 * same-origin <img src> that 302s to a short-lived signed Storage URL after
 * checking the caller owns the image AND its (live) post.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const size = request.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";

  try {
    const signedUrl = await getImageSignedUrl(supabase, user.id, id, size);
    if (!signedUrl) return notFoundResponse();
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: { "Cache-Control": `private, max-age=${REDIRECT_CACHE_SECONDS}` },
    });
  } catch (error) {
    return serverErrorResponse("library post image sign failed", error);
  }
}
