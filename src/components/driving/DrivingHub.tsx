"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { useTodoItems } from "@/hooks/useTodoItems";
import { useAppointments } from "@/hooks/useAppointments";
import { useCourses } from "@/hooks/useCourses";
import { usePeople } from "@/hooks/usePeople";
import { buildWeekGridData } from "@/lib/calendar/build-week-events";
import { buildDrivingQueue, type DrivingQueueItem } from "@/lib/driving/build-driving-queue";
import { DrivingCardDeck } from "@/components/driving/DrivingCardDeck";
import type { DrivingCardRow } from "@/components/driving/DrivingCard";
import { CaptureChannel } from "@/components/assistant/CaptureChannel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export function DrivingHub() {
  const router = useRouter();
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines();
  const { data: tasks, isLoading: tasksLoading } = useTasks({ limit: 100 });
  const { data: todoItems, isLoading: todoItemsLoading } = useTodoItems({ limit: 100 });
  const { data: appointments, isLoading: appointmentsLoading } = useAppointments({ limit: 100 });
  const { data: courses } = useCourses({ limit: 100 });
  const { data: people } = usePeople();

  const isLoading = deadlinesLoading || tasksLoading || todoItemsLoading || appointmentsLoading;

  // Deadlines/tasks passed as [] here on purpose -- buildWeekGridData also
  // re-plots them as calendar markers, which would double them up against
  // buildDrivingQueue's own buildUpcomingItems call below. Only course
  // meeting-block occurrences are wanted from the grid.
  const weekGrid = useMemo(() => buildWeekGridData(courses?.rows ?? [], [], [], people?.rows ?? []), [courses, people]);
  const todayCalendarEvents = useMemo(() => weekGrid.days.find((day) => day.isToday)?.events ?? [], [weekGrid]);

  const queue = useMemo(
    () =>
      buildDrivingQueue({
        deadlines: deadlines?.rows ?? [],
        tasks: tasks?.rows ?? [],
        todoItems: todoItems?.rows ?? [],
        appointments: appointments?.rows ?? [],
        todayCalendarEvents,
      }),
    [deadlines, tasks, todoItems, appointments, todayCalendarEvents],
  );

  const deadlineById = useMemo(() => new Map((deadlines?.rows ?? []).map((row) => [row.id, row])), [deadlines]);
  const taskById = useMemo(() => new Map((tasks?.rows ?? []).map((row) => [row.id, row])), [tasks]);
  const appointmentById = useMemo(() => new Map((appointments?.rows ?? []).map((row) => [row.id, row])), [appointments]);

  function getRow(item: DrivingQueueItem): DrivingCardRow {
    switch (item.kind) {
      case "deadline":
        return deadlineById.get(item.id) ?? null;
      case "task":
        return taskById.get(item.id) ?? null;
      case "session":
        return appointmentById.get(item.id) ?? null;
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Driving Mode</h1>
        <Button variant="destructive" size="md" className="px-6 py-3 text-base" onClick={() => router.push("/")}>
          Exit Driving Mode
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-72 w-full" /> : <DrivingCardDeck items={queue} getRow={getRow} />}

      <CaptureChannel large />
    </div>
  );
}
