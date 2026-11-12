import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryRecommenderLetterPayloadSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { createLetter } from "@/lib/library/server/recommenders";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/library/recommenders/[id]/letters — 201; 404 for a foreign recommender. */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryRecommenderLetterPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const letter = await createLetter(supabase, user.id, id, parsed.data);
    return letter ? successResponse(letter, { status: 201 }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library recommender letter create failed", error);
  }
}
