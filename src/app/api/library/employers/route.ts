import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryEmployerPayloadSchema } from "@/lib/api/library-schemas";
import { conflictResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { parseEmployerFilters } from "@/lib/library/employer-filters";
import { createEmployer, listEmployers } from "@/lib/library/server/employers";

/**
 * GET /api/library/employers — the caller's employers, newest first, each with
 * its live applications and contacts. Filters: q (name/notes/website/careers
 * url), status (has an application in that status), archived=exclude|only|all,
 * page, limit.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const { rows, total, page, limit } = await listEmployers(supabase, user.id, parseEmployerFilters(request.nextUrl.searchParams));
    return successResponse(rows, { meta: { total, page, limit } });
  } catch (error) {
    return serverErrorResponse("library employers list failed", error);
  }
}

/** POST /api/library/employers — 201 with the employer, 409 `{existing_id}` when the name is already taken. */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = libraryEmployerPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const result = await createEmployer(supabase, user.id, parsed.data);
    if (result.ok) return successResponse(result.employer, { status: 201 });
    return conflictResponse("You already have an employer with that name", { existing_id: result.reason === "conflict" ? result.existingId : null });
  } catch (error) {
    return serverErrorResponse("library employer create failed", error);
  }
}
