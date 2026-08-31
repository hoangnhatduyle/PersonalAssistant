"use client";

import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { useReminders } from "@/hooks/useReminders";
import { NowWidget } from "@/components/dashboard/NowWidget";
import { MomentumCard } from "@/components/dashboard/MomentumCard";
import { NextSequenceQueue } from "@/components/dashboard/NextSequenceQueue";
import { SuggestionBanner } from "@/components/dashboard/SuggestionBanner";
import { Skeleton } from "@/components/ui/Skeleton";

/** No /api/dashboard route exists — composes already-fetched entity hooks client-side. */
export function DashboardContainer() {
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: reminders, isLoading: remindersLoading } = useReminders({ state: ["Delivered", "Snoozed"] });

  const isLoading = deadlinesLoading || tasksLoading || remindersLoading;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Timefield / Today</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-text-primary">
          Your day, <span className="text-accent-teal">in signal</span>
        </h1>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <SuggestionBanner deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-6">
              <NowWidget deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} reminders={reminders?.rows ?? []} />
              <NextSequenceQueue deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} />
            </div>
            <MomentumCard deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
