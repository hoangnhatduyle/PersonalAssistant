import { requireAuthenticatedContext } from "@/lib/api/auth";
import { serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { sendPush } from "@/lib/push/send-push";

/**
 * POST /api/push/test -- sends a test notification to the CALLER's own
 * registered devices only (the select is RLS-scoped to them), so it can't be
 * used to push to anyone else. This is the Settings card's "Send test
 * notification" button: the quickest way to find out whether VAPID keys, the
 * service worker and the iOS permission are all wired up.
 *
 * A failure reason (HTTP status or error message, never the endpoint) is
 * returned so a missing-env or push-service problem is visible in the UI
 * instead of a silent "nothing arrived".
 */
export async function POST() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase } = ctx;

  const { data: subscriptions, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (error) return serverErrorResponse("push test lookup failed", error);
  if (!subscriptions || subscriptions.length === 0) {
    return validationErrorResponse("No device is registered for notifications yet");
  }

  let delivered = 0;
  let failureReason: string | null = null;
  const deadIds: string[] = [];
  for (const subscription of subscriptions) {
    const outcome = await sendPush(subscription, {
      title: "Cadence",
      body: "Test notification — push is working.",
      url: "/settings",
      tag: "push-test",
    });
    if (outcome.status === "sent") delivered += 1;
    else if (outcome.status === "gone") deadIds.push(subscription.id);
    else failureReason ??= outcome.reason;
  }

  if (deadIds.length > 0) await supabase.from("push_subscriptions").delete().in("id", deadIds);

  return successResponse({ delivered, removed: deadIds.length, failureReason });
}
