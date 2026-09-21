import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryApplicationPayloadSchema } from "@/lib/api/library-schemas";
import { parsePagination } from "@/lib/api/pagination";
import { conflictResponse, notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { isApplicationStatus } from "@/lib/library/application-status";
import { createApplication, listApplications } from "@/lib/library/server/applications";

/**
 * GET /api/library/applications — the caller's applications, most recently
 * moved first, each with its employer's `{id, name}` (what a pipeline-board
 * card needs). Filters: status, employerId, page, limit (max 100).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const { page, limit } = parsePagination(params);

  try {
    const result = await listApplications(supabase, user.id, {
      status: isApplicationStatus(status) ? status : undefined,
      employerId: params.get("employerId") || undefined,
      page,
      limit,
    });
    return successResponse(result.rows, { meta: { total: result.total, page: result.page, limit: result.limit } });
  } catch (error) {
    return serverErrorResponse("library applications list failed", error);
  }
}

/** POST /api/library/applications — 201; the initial `status` is allowed here only. 409 `{existing_id}` for a job URL already tracked, 404 for a foreign/deleted employer. */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = libraryApplicationPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const result = await createApplication(supabase, user.id, parsed.data);
    if (result.ok) return successResponse(result.application, { status: 201 });
    if (result.reason === "conflict") return conflictResponse("This job is already tracked", { existing_id: result.existingId });
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library application create failed", error);
  }
}
