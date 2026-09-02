"use client";

import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { useReminders } from "@/hooks/useReminders";
import { useTodoItems } from "@/hooks/useTodoItems";
import { useTodoLists } from "@/hooks/useTodoLists";
import { useCourses } from "@/hooks/useCourses";
import { NowWidget } from "@/components/dashboard/NowWidget";
import { MomentumCard } from "@/components/dashboard/MomentumCard";
import { NextSequenceQueue } from "@/components/dashboard/NextSequenceQueue";
import { SuggestionBanner } from "@/components/dashboard/SuggestionBanner";
import { PersonalizationSuggestionsPanel } from "@/components/dashboard/PersonalizationSuggestionsPanel";
import { WorkloadDensityStrip } from "@/components/dashboard/WorkloadDensityStrip";
import { StaleItemsCard } from "@/components/dashboard/StaleItemsCard";
import { CourseProgressList } from "@/components/dashboard/CourseProgressList";
import { Skeleton } from "@/components/ui/Skeleton";

/** No /api/dashboard route exists — composes already-fetched entity hooks client-side. */
export function DashboardContainer() {
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines();
  const { data: tasks, isLoading: tasksLoading } = useTasks({ limit: 100 });
  const { data: reminders, isLoading: remindersLoading } = useReminders({ state: ["Delivered", "Snoozed"] });
  const { data: todoItems, isLoading: todoItemsLoading } = useTodoItems({ limit: 100 });
  const { data: todoLists } = useTodoLists({ limit: 100 });
  const { data: courses } = useCourses({ limit: 100 });

  const isLoading = deadlinesLoading || tasksLoading || remindersLoading || todoItemsLoading;

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
          <PersonalizationSuggestionsPanel />
          <WorkloadDensityStrip
            deadlines={deadlines?.rows ?? []}
            tasks={tasks?.rows ?? []}
            todoItems={todoItems?.rows ?? []}
            todoLists={todoLists?.rows ?? []}
            courses={courses?.rows ?? []}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-6">
              <NowWidget deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} reminders={reminders?.rows ?? []} />
              <NextSequenceQueue deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} todoItems={todoItems?.rows ?? []} todoLists={todoLists?.rows ?? []} courses={courses?.rows ?? []} />
              <StaleItemsCard deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} todoItems={todoItems?.rows ?? []} />
            </div>
            <div className="flex flex-col gap-6">
              <MomentumCard deadlines={deadlines?.rows ?? []} tasks={tasks?.rows ?? []} todoItems={todoItems?.rows ?? []} />
              <CourseProgressList courses={courses?.rows ?? []} deadlines={deadlines?.rows ?? []} todoItems={todoItems?.rows ?? []} todoLists={todoLists?.rows ?? []} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
