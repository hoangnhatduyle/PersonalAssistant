import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryInterviewPayloadSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { createInterview, listInterviews } from "@/lib/library/server/interviews";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/library/applications/[id]/interviews — in schedule order, unscheduled rounds last. */
export async function GET(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  try {
    const interviews = await listInterviews(supabase, user.id, id);
    return interviews ? successResponse(interviews) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library interviews list failed", error);
  }
}

/** POST /api/library/applications/[id]/interviews — 201; 404 for a foreign application or interviewer. */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryInterviewPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const result = await createInterview(supabase, user.id, id, parsed.data);
    return result.ok ? successResponse(result.interview, { status: 201 }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library interview create failed", error);
  }
}
