import { requireAuthenticatedContext } from "@/lib/api/auth";
import { libraryContactPatchSchema } from "@/lib/api/library-schemas";
import { notFoundResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { removeContact, updateContact } from "@/lib/library/server/employer-contacts";

interface RouteParams {
  params: Promise<{ id: string; personId: string }>;
}

/** PATCH /api/library/employers/[id]/contacts/[personId] — `{kind?, note?}` (per-item because the link carries attributes). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id, personId } = await params;

  const parsed = libraryContactPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  try {
    const result = await updateContact(supabase, user.id, id, personId, parsed.data);
    return result.ok ? successResponse(result.contact) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library employer contact update failed", error);
  }
}

/** DELETE /api/library/employers/[id]/contacts/[personId] — a real unlink (the Person is untouched). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id, personId } = await params;

  try {
    return (await removeContact(supabase, user.id, id, personId)) ? successResponse({ employer_id: id, person_id: personId }) : notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library employer contact delete failed", error);
  }
}
