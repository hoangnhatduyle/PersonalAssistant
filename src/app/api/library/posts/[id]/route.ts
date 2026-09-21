import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryPostPatchSchema } from "@/lib/api/library-schemas";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import {
  conflictResponse,
  notFoundResponse,
  serverErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import { getPost, softDeletePost, updatePost } from "@/lib/library/server/posts";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/library/posts/[id] */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    const post = await getPost(supabase, user.id, id, { includeDeleted: wantsIncludeDeleted(request.nextUrl.searchParams) });
    return post ? successResponse(post) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library post get failed", error);
  }
}

/**
 * PATCH /api/library/posts/[id] — `url` recomputes platform + normalized_url
 * (`url: null` clears); `archived` toggles archived_at; person_ids /
 * course_ids replace the link set only when present.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryPostPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const result = await updatePost(supabase, user.id, id, parsed.data);
    if (result.ok) return successResponse(result.post);
    if (result.reason === "conflict") return conflictResponse("This link is already saved", { existing_id: result.existingId });
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library post update failed", error);
  }
}

/** DELETE /api/library/posts/[id] — soft delete (screenshot bytes stay in Storage). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    return (await softDeletePost(supabase, user.id, id)) ? successResponse({ id }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library post delete failed", error);
  }
}
