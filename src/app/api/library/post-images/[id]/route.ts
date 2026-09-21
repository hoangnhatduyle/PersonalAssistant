import { requireAuthenticatedContext } from "@/lib/api/auth";
import { notFoundResponse, serverErrorResponse, successResponse } from "@/lib/api/response";
import { deleteImage } from "@/lib/library/server/post-images";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** DELETE /api/library/post-images/[id] — soft delete (bytes retained). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    return (await deleteImage(supabase, user.id, id)) ? successResponse({ id }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library post image delete failed", error);
  }
}
