"use client";

import { useMemo } from "react";
import { useReminders } from "@/hooks/useReminders";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { ReminderCard } from "@/components/reminders/ReminderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * GET /api/reminders has no default state filter (returns every state
 * unless `?state=` is passed) — pass Delivered/Snoozed explicitly to match
 * a "needs action" inbox.
 */
export function SignalInbox() {
  const { data, isLoading } = useReminders({ state: ["Delivered", "Snoozed"] });
  // Deliberately unfiltered by person — reminder scheduling (syncReminderForTarget)
  // has no People-feature awareness, so a tracked person's Task/Deadline
  // reminder is delivered exactly like the owner's own. Rather than hiding
  // it (which would require touching that backend, out of scope), it's
  // labeled explicitly below via personLabelByKey.
  const { data: deadlines } = useDeadlines();
  const { data: tasks } = useTasks();
  const { data: people } = usePeople();

  const titleByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const deadline of deadlines?.rows ?? []) map.set(`deadline:${deadline.id}`, deadline.title);
    for (const task of tasks?.rows ?? []) map.set(`task:${task.id}`, task.title);
    return map;
  }, [deadlines, tasks]);

  const personLabelByKey = useMemo(() => {
    const personById = new Map((people?.rows ?? []).map((person) => [person.id, person.name]));
    const map = new Map<string, string>();
    for (const deadline of deadlines?.rows ?? []) {
      if (deadline.person_id) map.set(`deadline:${deadline.id}`, personById.get(deadline.person_id) ?? "Unknown");
    }
    for (const task of tasks?.rows ?? []) {
      if (task.person_id) map.set(`task:${task.id}`, personById.get(task.person_id) ?? "Unknown");
    }
    return map;
  }, [deadlines, tasks, people]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((n) => (
          <Skeleton key={n} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const reminders = data?.rows ?? [];
  if (reminders.length === 0) {
    return <EmptyState title="Signal inbox is clear" description="Nothing needs your attention right now." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {reminders.map((reminder) => {
        const key = `${reminder.target_type}:${reminder.target_id}`;
        return (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            targetTitle={titleByKey.get(key) ?? "Untitled item"}
            personLabel={personLabelByKey.get(key)}
          />
        );
      })}
    </div>
  );
}
