"use client";

import { useMemo } from "react";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { useReminders } from "@/hooks/useReminders";
import { useTodoLists } from "@/hooks/useTodoLists";
import { useCourses } from "@/hooks/useCourses";
import { useAppointments } from "@/hooks/useAppointments";
import { usePeople } from "@/hooks/usePeople";
import { UpNextPanel } from "@/components/dashboard/UpNextPanel";
import { MomentumCard } from "@/components/dashboard/MomentumCard";
import { DailyIntelligenceCard } from "@/components/dashboard/DailyIntelligenceCard";
import { WorkloadDensityStrip } from "@/components/dashboard/WorkloadDensityStrip";
import { StaleItemsCard } from "@/components/dashboard/StaleItemsCard";
import { CourseProgressList } from "@/components/dashboard/CourseProgressList";
import { Skeleton } from "@/components/ui/Skeleton";

/** No /api/dashboard route exists — composes already-fetched entity hooks client-side. */
export function DashboardContainer() {
  // Deadlines are owner-only everywhere now (People feature — matches Voice
  // Assistant's get_person_schedule, which never returns a tracked person's
  // Deadlines either).
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines({ personId: "me" });
  // Tasks stay unfiltered — a tracked person's Task is allowed to surface
  // here (labeled with their name by UpNextPanel below), unlike every other
  // kind on this page.
  const { data: tasks, isLoading: tasksLoading } = useTasks({ limit: 100 });
  const { data: reminders, isLoading: remindersLoading } = useReminders({ state: ["Delivered", "Snoozed"] });
  const { data: todoLists } = useTodoLists({ limit: 100 });
  const { data: courses } = useCourses({ limit: 100 });
  const { data: appointments } = useAppointments({ limit: 100 });
  const { data: people, isLoading: peopleLoading } = usePeople();

  const isLoading = deadlinesLoading || tasksLoading || remindersLoading || peopleLoading;

  // MomentumCard/WorkloadDensityStrip/StaleItemsCard have no label-rendering
  // capability of their own — feed them mine-only Tasks so a tracked
  // person's Task never leaks into those widgets unlabeled. UpNextPanel
  // below gets the full unfiltered list plus `people` so it can label them.
  const mineOnlyTasks = useMemo(() => (tasks?.rows ?? []).filter((task) => task.person_id === null), [tasks]);

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
          <DailyIntelligenceCard />
          <WorkloadDensityStrip
            deadlines={deadlines?.rows ?? []}
            tasks={mineOnlyTasks}
            todoLists={todoLists?.rows ?? []}
            courses={courses?.rows ?? []}
            appointments={appointments?.rows ?? []}
          />

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <UpNextPanel
              deadlines={deadlines?.rows ?? []}
              tasks={tasks?.rows ?? []}
              people={people?.rows ?? []}
              reminders={reminders?.rows ?? []}
              todoLists={todoLists?.rows ?? []}
              courses={courses?.rows ?? []}
              appointments={appointments?.rows ?? []}
            />
            <MomentumCard deadlines={deadlines?.rows ?? []} tasks={mineOnlyTasks} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
            <StaleItemsCard deadlines={deadlines?.rows ?? []} tasks={mineOnlyTasks} />
            <CourseProgressList courses={courses?.rows ?? []} deadlines={deadlines?.rows ?? []} tasks={mineOnlyTasks} todoLists={todoLists?.rows ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
