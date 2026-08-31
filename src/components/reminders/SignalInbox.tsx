"use client";

import { useMemo } from "react";
import { useReminders } from "@/hooks/useReminders";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
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
  const { data: deadlines } = useDeadlines();
  const { data: tasks } = useTasks();

  const titleByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const deadline of deadlines?.rows ?? []) map.set(`deadline:${deadline.id}`, deadline.title);
    for (const task of tasks?.rows ?? []) map.set(`task:${task.id}`, task.title);
    return map;
  }, [deadlines, tasks]);

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
      {reminders.map((reminder) => (
        <ReminderCard
          key={reminder.id}
          reminder={reminder}
          targetTitle={titleByKey.get(`${reminder.target_type}:${reminder.target_id}`) ?? "Untitled item"}
        />
      ))}
    </div>
  );
}
