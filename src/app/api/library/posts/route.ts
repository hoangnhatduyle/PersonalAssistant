import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryPostPayloadSchema } from "@/lib/api/library-schemas";
import {
  conflictResponse,
  notFoundResponse,
  serverErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import { parseLibraryPostFilters } from "@/lib/library/filters";
import { createPost, listPosts } from "@/lib/library/server/posts";

/**
 * GET /api/library/posts — the caller's saved posts, newest first. Filters:
 * q, platform, favorite=true, archived=exclude|only|all, tag (repeatable /
 * comma-joined, AND), personId, courseId, page, limit.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const { rows, total, page, limit } = await listPosts(supabase, user.id, parseLibraryPostFilters(request.nextUrl.searchParams));
    return successResponse(rows, { meta: { total, page, limit } });
  } catch (error) {
    return serverErrorResponse("library posts list failed", error);
  }
}

/** POST /api/library/posts — 201 with the post, 409 `{existing_id}` when the URL is already saved, 404 for a foreign person/course. */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = libraryPostPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const result = await createPost(supabase, user.id, parsed.data);
    if (result.ok) return successResponse(result.post, { status: 201 });
    if (result.reason === "conflict") return conflictResponse("This link is already saved", { existing_id: result.existingId });
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library post create failed", error);
  }
}
