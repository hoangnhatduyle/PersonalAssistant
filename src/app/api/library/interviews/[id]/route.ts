import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryInterviewPatchSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { softDeleteInterview, updateInterview } from "@/lib/library/server/interviews";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/library/interviews/[id] */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryInterviewPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const result = await updateInterview(supabase, user.id, id, parsed.data);
    return result.ok ? successResponse(result.interview) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library interview update failed", error);
  }
}

/** DELETE /api/library/interviews/[id] — soft delete. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    return (await softDeleteInterview(supabase, user.id, id)) ? successResponse({ id }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library interview delete failed", error);
  }
}
