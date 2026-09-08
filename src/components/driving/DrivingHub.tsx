"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { useTodoItems } from "@/hooks/useTodoItems";
import { useTodoLists } from "@/hooks/useTodoLists";
import { useAppointments } from "@/hooks/useAppointments";
import { useCourses } from "@/hooks/useCourses";
import { usePeople } from "@/hooks/usePeople";
import { buildWeekGridData } from "@/lib/calendar/build-week-events";
import { buildDrivingQueue, type DrivingQueueItem } from "@/lib/driving/build-driving-queue";
import { DrivingCardDeck, type DrivingCardMeta } from "@/components/driving/DrivingCardDeck";
import type { DrivingCardRow } from "@/components/driving/DrivingCard";
import { CaptureChannel } from "@/components/assistant/CaptureChannel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export function DrivingHub() {
  const router = useRouter();
  // Deadlines are owner-only everywhere now (People feature) — matches
  // Voice Assistant's get_person_schedule, which never returns a tracked
  // person's Deadlines either.
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines({ personId: "me" });
  // Tasks stay unfiltered — a tracked person's Task is allowed to surface
  // here (labeled with their name), unlike every other kind in this queue.
  const { data: tasks, isLoading: tasksLoading } = useTasks({ limit: 100 });
  const { data: todoItems, isLoading: todoItemsLoading } = useTodoItems({ limit: 100 });
  const { data: appointments, isLoading: appointmentsLoading } = useAppointments({ limit: 100 });
  const { data: todoLists } = useTodoLists({ limit: 100 });
  const { data: courses } = useCourses({ limit: 100 });
  const { data: people } = usePeople();

  const isLoading = deadlinesLoading || tasksLoading || todoItemsLoading || appointmentsLoading;

  // Deadlines/tasks passed as [] here on purpose -- buildWeekGridData also
  // re-plots them as calendar markers, which would double them up against
  // buildDrivingQueue's own buildUpcomingItems call below. Only course
  // meeting-block occurrences are wanted from the grid.
  const weekGrid = useMemo(() => buildWeekGridData(courses?.rows ?? [], [], [], people?.rows ?? []), [courses, people]);
  const todayCalendarEvents = useMemo(() => weekGrid.days.find((day) => day.isToday)?.events ?? [], [weekGrid]);

  const courseById = useMemo(() => new Map((courses?.rows ?? []).map((row) => [row.id, row])), [courses]);
  const todoListById = useMemo(() => new Map((todoLists?.rows ?? []).map((row) => [row.id, row])), [todoLists]);
  // Defensive: a todo_list's course_id can point to a tracked person's
  // course (the API/DB trigger only check course ownership, not
  // person_id IS NULL — a known gap, closed at the source separately).
  // Course To-Do items are owner-only, unlike Tasks, so exclude any item
  // whose list resolves to a person-owned course.
  const ownedTodoItems = useMemo(() => {
    return (todoItems?.rows ?? []).filter((item) => {
      const list = todoListById.get(item.list_id);
      const course = list?.course_id ? courseById.get(list.course_id) : undefined;
      return !course || course.person_id === null;
    });
  }, [todoItems, todoListById, courseById]);

  const queue = useMemo(
    () =>
      buildDrivingQueue({
        deadlines: deadlines?.rows ?? [],
        tasks: tasks?.rows ?? [],
        todoItems: ownedTodoItems,
        appointments: appointments?.rows ?? [],
        people: people?.rows ?? [],
        todayCalendarEvents,
      }),
    [deadlines, tasks, ownedTodoItems, appointments, people, todayCalendarEvents],
  );

  const deadlineById = useMemo(() => new Map((deadlines?.rows ?? []).map((row) => [row.id, row])), [deadlines]);
  const taskById = useMemo(() => new Map((tasks?.rows ?? []).map((row) => [row.id, row])), [tasks]);
  const appointmentById = useMemo(() => new Map((appointments?.rows ?? []).map((row) => [row.id, row])), [appointments]);
  const todoItemById = useMemo(() => new Map((todoItems?.rows ?? []).map((row) => [row.id, row])), [todoItems]);

  function getRow(item: DrivingQueueItem): DrivingCardRow {
    switch (item.kind) {
      case "deadline":
        return deadlineById.get(item.id) ?? null;
      case "task":
        return taskById.get(item.id) ?? null;
      case "session":
      case "appointment":
        return appointmentById.get(item.id) ?? null;
      default:
        return null;
    }
  }

  function getMeta(item: DrivingQueueItem): DrivingCardMeta {
    switch (item.kind) {
      case "deadline": {
        const deadline = deadlineById.get(item.id);
        return { subtitle: deadline ? courseById.get(deadline.course_id)?.name : undefined };
      }
      case "task":
        return { tags: taskById.get(item.id)?.tags, personLabel: item.personId ? item.personLabel : undefined };
      case "todo": {
        const todoItem = todoItemById.get(item.id);
        const list = todoItem ? todoListById.get(todoItem.list_id) : undefined;
        const course = list?.course_id ? courseById.get(list.course_id) : undefined;
        return { subtitle: course?.name ?? list?.name };
      }
      case "session": {
        const session = appointmentById.get(item.id);
        const deadline = session?.deadline_id ? deadlineById.get(session.deadline_id) : undefined;
        return { subtitle: deadline?.title };
      }
      case "appointment": {
        const appointment = appointmentById.get(item.id);
        return { subtitle: [appointment?.category, appointment?.location].filter(Boolean).join(" · ") || undefined };
      }
      default:
        return {};
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

      {isLoading ? <Skeleton className="h-72 w-full" /> : <DrivingCardDeck items={queue} getRow={getRow} getMeta={getMeta} />}

      <CaptureChannel large />
    </div>
  );
}
