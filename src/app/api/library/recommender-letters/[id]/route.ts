import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryRecommenderLetterPatchSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { deleteLetter, updateLetter } from "@/lib/library/server/recommenders";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/library/recommender-letters/[id] */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryRecommenderLetterPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const updated = await updateLetter(supabase, user.id, id, parsed.data);
    return updated ? successResponse(updated) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library recommender letter update failed", error);
  }
}

/** DELETE /api/library/recommender-letters/[id] */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    return (await deleteLetter(supabase, user.id, id)) ? successResponse({ id }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library recommender letter delete failed", error);
  }
}
