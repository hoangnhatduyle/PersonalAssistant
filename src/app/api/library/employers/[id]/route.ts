import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryEmployerPatchSchema } from "@/lib/api/library-schemas";
import { wantsIncludeDeleted } from "@/lib/api/pagination";
import { conflictResponse, notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { getEmployer, softDeleteEmployer, updateEmployer } from "@/lib/library/server/employers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/library/employers/[id] — with applications, contacts (live people only) and linked posts. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    const employer = await getEmployer(supabase, user.id, id, { includeDeleted: wantsIncludeDeleted(request.nextUrl.searchParams) });
    return employer ? successResponse(employer) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library employer get failed", error);
  }
}

/** PATCH /api/library/employers/[id] — `archived` toggles archived_at; a taken name is a 409. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryEmployerPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const result = await updateEmployer(supabase, user.id, id, parsed.data);
    if (result.ok) return successResponse(result.employer);
    if (result.reason === "conflict") return conflictResponse("You already have an employer with that name", { existing_id: result.existingId });
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library employer update failed", error);
  }
}

/** DELETE /api/library/employers/[id] — soft delete via Library's cascade (applications + interviews soft-deleted, contacts and post links removed). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    const cascade = await softDeleteEmployer(supabase, user.id, id);
    return cascade ? successResponse({ id, cascade }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library employer delete failed", error);
  }
}
