import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryRecommenderPayloadSchema } from "@/lib/api/library-schemas";
import { serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { createRecommender, listRecommenders } from "@/lib/library/server/recommenders";

/** GET /api/library/recommenders — every recommender with their letters embedded. */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    return successResponse(await listRecommenders(supabase, user.id));
  } catch (error) {
    return serverErrorResponse("library recommenders list failed", error);
  }
}

/** POST /api/library/recommenders — 201. */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = libraryRecommenderPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    return successResponse(await createRecommender(supabase, user.id, parsed.data), { status: 201 });
  } catch (error) {
    return serverErrorResponse("library recommender create failed", error);
  }
}
