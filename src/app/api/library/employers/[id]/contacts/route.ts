import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryContactPayloadSchema } from "@/lib/api/library-schemas";
import { conflictResponse, notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { addContact } from "@/lib/library/server/employer-contacts";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/library/employers/[id]/contacts — `{person_id, kind?, note?}`; 409 when that person is already a contact, 404 for a foreign employer/person. */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const parsed = libraryContactPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const result = await addContact(supabase, user.id, id, parsed.data);
    if (result.ok) return successResponse(result.contact, { status: 201 });
    if (result.reason === "conflict") return conflictResponse("That person is already a contact here");
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library employer contact create failed", error);
  }
}
