import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, serverErrorResponse } from "@/lib/api/response";

export interface MailAccountSummary {
  provider: string;
  provider_email: string;
}

/** GET /api/mail/accounts — which providers the caller has connected, for the dashboard tab switcher. */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from("mail_accounts")
    .select("provider, provider_email")
    .eq("user_id", user.id);
  if (error) return serverErrorResponse("mail accounts list failed", error);

  return successResponse<MailAccountSummary[]>(data);
}
