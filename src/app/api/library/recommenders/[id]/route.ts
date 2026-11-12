import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryRecommenderPatchSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { deleteRecommender, updateRecommender } from "@/lib/library/server/recommenders";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/library/recommenders/[id] */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryRecommenderPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const updated = await updateRecommender(supabase, user.id, id, parsed.data);
    return updated ? successResponse(updated) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library recommender update failed", error);
  }
}

/** DELETE /api/library/recommenders/[id] — removes the recommender and their letters. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    return (await deleteRecommender(supabase, user.id, id)) ? successResponse({ id }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library recommender delete failed", error);
  }
}
