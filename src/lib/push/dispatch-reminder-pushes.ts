import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildReminderPushPayload } from "@/lib/push/reminder-payload";
import type { PushPayload, PushSendResult, PushSubscriptionRecord } from "@/lib/push/send-push";

export interface DispatchDeps {
  send: (subscription: PushSubscriptionRecord, payload: PushPayload) => Promise<PushSendResult>;
  now?: () => Date;
}

export interface DispatchResult {
  /** Reminders pushed to at least one device. */
  sent: number;
  /** Claimed but nothing to deliver: the target is gone/undated, or every device's subscription was dead. */
  skipped: number;
  /** Every attempt failed transiently; the claim was reverted so the next tick retries. */
  failed: number;
  /** Delivered reminders left untouched because their owner has no push subscription. */
  noSubscription: number;
  /** Dead subscriptions (404/410) deleted along the way. */
  subscriptionsRemoved: number;
}

type Client = SupabaseClient<Database>;

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/**
 * Pushes every Delivered-but-not-yet-pushed reminder to its owner's devices.
 * The push twin of the send-reminder-emails route, with the same
 * claim-then-compensate protocol (see that route's header), keyed on
 * reminders.pushed_at instead of emailed_at so the two channels retry
 * independently. Takes a service-role client: it must see every user's
 * reminders and subscriptions, not one caller's.
 *
 *   1. Candidates: Delivered, pushed_at IS NULL.
 *   2. A reminder whose owner has NO subscription is left alone -- not claimed
 *      -- so it stays eligible until it Expires (60 min) and a device that
 *      subscribes in that window still gets it.
 *   3. Each remaining reminder is claimed with `UPDATE ... SET pushed_at = now()
 *      WHERE id = X AND pushed_at IS NULL`; zero rows back means a concurrent
 *      or overlapping run already took it.
 *   4. It is sent to every one of the owner's devices. Dead subscriptions are
 *      deleted. The claim stands if at least one device got it, or if every
 *      device was dead (nothing left to retry). It is reverted only when no
 *      device received it AND at least one failure was transient.
 *
 * Known gap, accepted: when one device succeeds and another fails transiently,
 * the claim stands and the failing device misses this reminder.
 */
export async function dispatchReminderPushes(supabase: Client, deps: DispatchDeps): Promise<DispatchResult> {
  const now = deps.now ?? (() => new Date());
  const result: DispatchResult = { sent: 0, skipped: 0, failed: 0, noSubscription: 0, subscriptionsRemoved: 0 };

  const candidates = check(
    await supabase.from("reminders").select("id, target_type, target_id, user_id").eq("acknowledgment_state", "Delivered").is("pushed_at", null),
    "reminder candidate lookup failed",
  );
  if (!candidates || candidates.length === 0) return result;

  const userIds = [...new Set(candidates.map((reminder) => reminder.user_id))];
  const subscriptions = check(
    await supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
    "push subscription lookup failed",
  );
  const subscriptionsByUser = new Map<string, NonNullable<typeof subscriptions>>();
  for (const subscription of subscriptions ?? []) {
    subscriptionsByUser.set(subscription.user_id, [...(subscriptionsByUser.get(subscription.user_id) ?? []), subscription]);
  }

  const eligible = candidates.filter((reminder) => (subscriptionsByUser.get(reminder.user_id)?.length ?? 0) > 0);
  result.noSubscription = candidates.length - eligible.length;
  if (eligible.length === 0) return result;

  const taskIds = eligible.filter((reminder) => reminder.target_type === "task").map((reminder) => reminder.target_id);
  const deadlineIds = eligible.filter((reminder) => reminder.target_type === "deadline").map((reminder) => reminder.target_id);
  const [tasks, deadlines] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id, title, due_at, deleted_at").in("id", taskIds) : Promise.resolve({ data: [], error: null }),
    deadlineIds.length ? supabase.from("deadlines").select("id, title, due_at, deleted_at, course_id").in("id", deadlineIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const taskById = new Map((check(tasks, "task lookup failed") ?? []).map((task) => [task.id, task]));
  const deadlineRows = check(deadlines, "deadline lookup failed") ?? [];
  const deadlineById = new Map(deadlineRows.map((deadline) => [deadline.id, deadline]));

  // Enrichment only: a lookup failure just drops the course name from the body.
  const courseIds = [...new Set(deadlineRows.map((deadline) => deadline.course_id))];
  const { data: courses } = courseIds.length ? await supabase.from("courses").select("id, name").in("id", courseIds) : { data: [] };
  const courseNameById = new Map((courses ?? []).map((course) => [course.id, course.name]));

  for (const reminder of eligible) {
    const { data: claimed } = await supabase
      .from("reminders")
      .update({ pushed_at: now().toISOString() })
      .eq("id", reminder.id)
      .is("pushed_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // lost the race to a concurrent/overlapping invocation

    const deadline = reminder.target_type === "deadline" ? deadlineById.get(reminder.target_id) : undefined;
    const target = reminder.target_type === "task" ? taskById.get(reminder.target_id) : deadline;
    if (!target || target.deleted_at || !target.due_at) {
      result.skipped += 1; // nothing actionable to send; claim stands, no retry
      continue;
    }

    const payload = buildReminderPushPayload({
      reminderId: reminder.id,
      targetType: reminder.target_type as "task" | "deadline",
      targetId: target.id,
      title: target.title,
      dueAt: target.due_at,
      courseName: deadline ? (courseNameById.get(deadline.course_id) ?? null) : undefined,
      now: now(),
    });

    let delivered = 0;
    let transientFailures = 0;
    const deadSubscriptionIds: string[] = [];
    for (const subscription of subscriptionsByUser.get(reminder.user_id) ?? []) {
      const outcome = await deps.send(subscription, payload);
      if (outcome.status === "sent") delivered += 1;
      else if (outcome.status === "gone") deadSubscriptionIds.push(subscription.id);
      else {
        transientFailures += 1;
        console.error("reminder push failed:", outcome.reason);
      }
    }

    if (deadSubscriptionIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", deadSubscriptionIds);
      result.subscriptionsRemoved += deadSubscriptionIds.length;
      // Drop them from the in-memory map too, so a user's next reminder in this
      // same run does not retry an endpoint we just learned is dead.
      subscriptionsByUser.set(
        reminder.user_id,
        (subscriptionsByUser.get(reminder.user_id) ?? []).filter((subscription) => !deadSubscriptionIds.includes(subscription.id)),
      );
    }

    if (delivered > 0) {
      result.sent += 1;
    } else if (transientFailures > 0) {
      result.failed += 1;
      // Compensate: un-claim so the next tick retries this one row.
      await supabase.from("reminders").update({ pushed_at: null }).eq("id", reminder.id);
    } else {
      result.skipped += 1; // every device was dead: nothing left to retry
    }
  }

  return result;
}
