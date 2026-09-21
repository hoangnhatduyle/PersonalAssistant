import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryApplicationPatchSchema } from "@/lib/api/library-schemas";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { conflictResponse, notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { getApplication, softDeleteApplication, updateApplication } from "@/lib/library/server/applications";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/library/applications/[id] */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    const application = await getApplication(supabase, user.id, id, { includeDeleted: wantsIncludeDeleted(request.nextUrl.searchParams) });
    return application ? successResponse(application) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library application get failed", error);
  }
}

/**
 * PATCH /api/library/applications/[id] — the schema deliberately omits
 * `status` (NC-API-002): status moves only through POST .../transition.
 * `job_url` recomputes normalized_job_url (`null` clears).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryApplicationPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const result = await updateApplication(supabase, user.id, id, parsed.data);
    if (result.ok) return successResponse(result.application);
    if (result.reason === "conflict") return conflictResponse("This job is already tracked", { existing_id: result.existingId });
    if (result.reason === "invalid_salary") return validationErrorResponse("The maximum salary can't be below the minimum");
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library application update failed", error);
  }
}

/** DELETE /api/library/applications/[id] — soft delete (status history is kept). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    return (await softDeleteApplication(supabase, user.id, id)) ? successResponse({ id }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library application delete failed", error);
  }
}
