import { requireAuthenticatedContext } from "@/lib/api/auth";
import { mailProviderSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";
import { deleteMailAccount } from "@/lib/mail/accounts";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

/** DELETE /api/mail/accounts/[provider] — disconnects a connected mailbox. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { provider: providerParam } = await params;
  const parsed = mailProviderSchema.safeParse(providerParam);
  if (!parsed.success) return validationErrorResponse("Unknown mail provider");

  try {
    await deleteMailAccount(supabase, user.id, parsed.data);
  } catch (error) {
    return serverErrorResponse("mail account disconnect failed", error);
  }

  return successResponse({ provider: parsed.data });
}
