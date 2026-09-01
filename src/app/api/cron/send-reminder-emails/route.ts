import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireEnv } from "@/lib/env";
import { sendReminderEmail } from "@/lib/email/send-reminder-email";
import { successResponse, unauthorizedResponse, serverErrorResponse } from "@/lib/api/response";

/**
 * POST /api/cron/send-reminder-emails — invoked by the reminder-emails
 * GitHub Actions workflow (.github/workflows/reminder-emails.yml) on a
 * 5-minute schedule, never by an end user, so this deliberately does NOT
 * use requireAuthenticatedContext(): there is no user session on a
 * scheduled invocation. Instead this checks a shared-secret bearer token,
 * then uses createServiceRoleClient() to bypass RLS — this job must see
 * every user's Delivered reminders, not just one caller's.
 *
 * Per-row claim-then-compensate protocol (deliberately not folded into
 * dispatch_due_reminders() itself — this repo's own pg_cron/pg_net
 * rejection rationale, documented in 0003/0004/0006/0007/0011, is that an
 * outbound HTTP call from inside Postgres can't honestly report its own
 * success/failure; sending email is therefore done here, in application
 * code, against reminders that dispatch_due_reminders() already flipped to
 * Delivered):
 *   1. Select candidates: Delivered, emailed_at IS NULL, whose owning user
 *      has email_reminders_enabled (a missing preferences row counts as
 *      enabled, matching DEFAULT_USER_PREFERENCES).
 *   2. Per candidate, claim it with `UPDATE ... SET emailed_at = now()
 *      WHERE id = X AND emailed_at IS NULL` (same optimistic-concurrency
 *      shape as reminders/[id]/ack's `WHERE ... AND acknowledgment_state =
 *      <old>` guard) — 0 rows affected means a concurrent/overlapping
 *      invocation already claimed it; skip.
 *   3. Resolve the target's title (task/deadline) and the owner's email; if
 *      the target is soft-deleted or the owner has no email on file, leave
 *      the claim in place (nothing useful to retry) and move on.
 *   4. Send the email. On success the claim from step 2 already marks it
 *      done. On failure, revert emailed_at back to null for that one row so
 *      the next tick retries it — one failed send must never abort the
 *      batch or block any other row.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    return unauthorizedResponse();
  }

  const supabase = createServiceRoleClient();

  const { data: candidates, error: fetchError } = await supabase
    .from("reminders")
    .select("id, target_type, target_id, user_id")
    .eq("acknowledgment_state", "Delivered")
    .is("emailed_at", null);
  if (fetchError) return serverErrorResponse("reminder candidate lookup failed", fetchError);
  if (!candidates || candidates.length === 0) {
    return successResponse({ sent: 0, skipped: 0, failed: 0 });
  }

  const userIds = [...new Set(candidates.map((reminder) => reminder.user_id))];
  const { data: prefs, error: prefsError } = await supabase
    .from("user_preferences")
    .select("user_id, email_reminders_enabled")
    .in("user_id", userIds);
  if (prefsError) return serverErrorResponse("user preferences lookup failed", prefsError);

  const optedOutUserIds = new Set((prefs ?? []).filter((pref) => !pref.email_reminders_enabled).map((pref) => pref.user_id));
  const eligible = candidates.filter((reminder) => !optedOutUserIds.has(reminder.user_id));

  const taskIds = eligible.filter((reminder) => reminder.target_type === "task").map((reminder) => reminder.target_id);
  const deadlineIds = eligible.filter((reminder) => reminder.target_type === "deadline").map((reminder) => reminder.target_id);

  const [tasksResult, deadlinesResult, profilesResult] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id, title, due_at, deleted_at").in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    deadlineIds.length
      ? supabase.from("deadlines").select("id, title, due_at, deleted_at").in("id", deadlineIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("profiles").select("id, email").in("id", userIds),
  ]);
  if (tasksResult.error) return serverErrorResponse("task lookup failed", tasksResult.error);
  if (deadlinesResult.error) return serverErrorResponse("deadline lookup failed", deadlinesResult.error);
  if (profilesResult.error) return serverErrorResponse("profile lookup failed", profilesResult.error);

  const taskById = new Map((tasksResult.data ?? []).map((task) => [task.id, task]));
  const deadlineById = new Map((deadlinesResult.data ?? []).map((deadline) => [deadline.id, deadline]));
  const emailByUserId = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.email]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const reminder of eligible) {
    const { data: claimed } = await supabase
      .from("reminders")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", reminder.id)
      .is("emailed_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // lost the race to a concurrent/overlapping invocation

    const target = reminder.target_type === "task" ? taskById.get(reminder.target_id) : deadlineById.get(reminder.target_id);
    const email = emailByUserId.get(reminder.user_id);
    if (!target || target.deleted_at || !target.due_at || !email) {
      skipped += 1; // nothing actionable to send; claim stands, no retry
      continue;
    }

    try {
      await sendReminderEmail(email, {
        targetType: reminder.target_type as "task" | "deadline",
        title: target.title,
        dueAt: target.due_at,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("reminder email send failed", error);
      // Compensate: un-claim so the next tick retries this one row.
      await supabase.from("reminders").update({ emailed_at: null }).eq("id", reminder.id);
    }
  }

  return successResponse({ sent, skipped, failed });
}
