import { requireAuthenticatedContext } from "@/lib/api/auth";
import { conflictResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { pushSubscribeBodySchema, pushUnsubscribeBodySchema } from "@/lib/push/schemas";

// Postgres' insufficient_privilege, which is what an RLS-denied write surfaces as.
const RLS_VIOLATION = "42501";
const MAX_USER_AGENT_CHARS = 255;

/**
 * POST /api/push/subscribe -- registers (or refreshes) the caller's browser
 * endpoint for reminder pushes. A subscription row's existence is the opt-in.
 *
 * Upserts on `endpoint`, which is globally unique (0057_web_push.sql): the same
 * browser re-subscribing just refreshes its keys. If that endpoint already
 * belongs to ANOTHER account -- someone signed into a second account on a
 * device that never unsubscribed -- the RLS update check rejects the write and
 * this returns 409, rather than ever moving a device between accounts. The
 * client's sign-out unsubscribes first, so this is the unusual path.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = pushSubscribeBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, MAX_USER_AGENT_CHARS) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    if (error.code === RLS_VIOLATION) return conflictResponse("This device is already registered to another account");
    return serverErrorResponse("push subscribe failed", error);
  }

  return successResponse({ subscribed: true }, { status: 201 });
}

/** DELETE /api/push/subscribe -- removes the caller's own row for this endpoint (RLS scopes the delete to them). */
export async function DELETE(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = pushUnsubscribeBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).eq("user_id", user.id);
  if (error) return serverErrorResponse("push unsubscribe failed", error);

  return successResponse({ subscribed: false });
}
