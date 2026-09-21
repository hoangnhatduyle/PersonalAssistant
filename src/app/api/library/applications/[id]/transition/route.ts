import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryApplicationTransitionSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { transitionApplication } from "@/lib/library/server/applications";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/library/applications/[id]/transition — the only way an
 * application's status changes (NC-API-002). Body `{ to }`. Any status may
 * move to any other (a job hunt isn't linear); moving to the current status
 * is a 400. The DB stamps status_changed_at and appends the history event.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryApplicationTransitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Unknown application status");

  try {
    const result = await transitionApplication(supabase, user.id, id, parsed.data.to);
    if (result.ok) return successResponse(result.application);
    if (result.reason === "unchanged") return validationErrorResponse(`Application is already "${parsed.data.to}"`);
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library application transition failed", error);
  }
}
