import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireEnv } from "@/lib/env";
import { dispatchReminderPushes } from "@/lib/push/dispatch-reminder-pushes";
import { sendPush } from "@/lib/push/send-push";
import { successResponse, unauthorizedResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * POST /api/cron/send-reminder-pushes -- web-push twin of send-reminder-emails,
 * invoked by the same GitHub Actions workflow
 * (.github/workflows/reminder-emails.yml) on its 5-minute schedule, never by an
 * end user. So, like that route, it does NOT use requireAuthenticatedContext():
 * it checks the shared-secret bearer token and uses the service-role client to
 * see every user's reminders and push subscriptions.
 *
 * The claim-then-compensate protocol lives in dispatchReminderPushes (see its
 * header); this route is only auth + wiring.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    return unauthorizedResponse();
  }

  try {
    const result = await dispatchReminderPushes(createServiceRoleClient(), { send: sendPush });
    return successResponse(result);
  } catch (error) {
    return serverErrorResponse("reminder push dispatch failed", error);
  }
}
