"use client";

import { useState } from "react";
import Link from "next/link";
import { useCourse, useUpdateCourse } from "@/hooks/useCourses";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTodoLists } from "@/hooks/useTodoLists";
import { useTasks } from "@/hooks/useTasks";
import { CourseForm } from "@/components/courses/CourseForm";
import { DeleteCourseButton } from "@/components/courses/DeleteCourseButton";
import { DeadlineList } from "@/components/deadlines/DeadlineList";
import { BoardCard } from "@/components/board/BoardCard";
import { BoardCardDetailDialog } from "@/components/board/BoardCardDetailDialog";
import { NotesForTarget } from "@/components/notes/NotesForTarget";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { formatBlocksSummary } from "@/lib/calendar/recurrence";
import type { CoursePayload } from "@/lib/api/schemas";
import { formatLeadMinutes } from "@/lib/reminders/lead-time";

type Props = {
  courseId: string;
};

export function CourseDetailContainer({ courseId }: Props) {
  const { data: course, isLoading } = useCourse(courseId);
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines({ courseId });
  const { data: todoLists, isLoading: todoListsLoading } = useTodoLists({ courseId });
  // No listId filter on useTasks for multiple lists at once — fetch all and
  // group client-side, same pattern BoardContainer uses.
  const { data: tasks, isLoading: tasksLoading } = useTasks({ limit: 100 });
  const updateCourse = useUpdateCourse(courseId);
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  // Hidden by default, same convention as BoardContainer's own toggle — a
  // finished card is clutter on the course page until this brings it back.
  const [showCompleted, setShowCompleted] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!course) return <p className="text-sm text-text-secondary">Course not found.</p>;

  // A course has at most one live Board List (DB-enforced unique-per-course
  // index) — any extras would only be legacy data predating that
  // constraint, so ignore them defensively rather than rendering a grid.
  const list = todoLists?.rows[0];
  const listTasks = list ? (tasks?.rows ?? []).filter((task) => task.list_id === list.id) : [];
  // Same filter BoardContainer's showCompleted toggle applies: off shows
  // Open only, on reveals Done and Cancelled too.
  const visibleTasks = showCompleted ? listTasks : listTasks.filter((task) => task.status === "Open");
  const boardLoading = todoListsLoading || tasksLoading;

  const handleUpdate = async (values: CoursePayload) => {
    try {
      await updateCourse.mutateAsync(values);
      showToast("Course updated", "success");
      setIsEditing(false);
    } catch {
      showToast("Could not update course", "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
              {[course.code, course.term].filter(Boolean).join(" · ") || "Course"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">{course.name}</h1>
            <p className="mt-1 text-sm text-text-secondary">{formatBlocksSummary(course.meeting_blocks)}</p>
            {course.location && <p className="text-sm text-text-secondary">{course.location}</p>}
            {course.instructor && <p className="text-sm text-text-secondary">{course.instructor}</p>}
          </div>
          <Badge tone={course.reminders_enabled ? "ok" : "neutral"}>
            {course.reminders_enabled ? `Reminders ${formatLeadMinutes(course.reminder_lead_minutes)} lead` : "Reminders off"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setIsEditing((value) => !value)}>
            {isEditing ? "Cancel edit" : "Edit"}
          </Button>
          <DeleteCourseButton courseId={course.id} />
        </div>

        {isEditing && (
          <CourseForm course={course} onSubmit={handleUpdate} onCancel={() => setIsEditing(false)} submitLabel="Save changes" />
        )}
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Deadlines</p>
          <Link href="/courses/deadlines" className="text-xs text-accent-indigo hover:underline">
            View all
          </Link>
        </div>
        {deadlinesLoading ? <Skeleton className="h-24 w-full" /> : <DeadlineList deadlines={deadlines?.rows ?? []} />}
      </GlassPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <GlassPanel className="flex min-w-0 flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Board</p>
            {list && <Switch checked={showCompleted} onCheckedChange={setShowCompleted} label="Show completed" />}
          </div>
          {boardLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !list ? (
            <EmptyState title="No Board List yet" description="Create one from the Board." />
          ) : visibleTasks.length === 0 ? (
            listTasks.length === 0 ? (
              <EmptyState title="No cards yet" description="Add a card from the Board." />
            ) : (
              <EmptyState title="Nothing open" description="Every card on this list is done or cancelled." />
            )
          ) : (
            <div className="flex flex-col gap-2">
              {visibleTasks.map((task) => (
                // Course-scoped lists are owner-only (see /api/todo-lists POST) —
                // person_id never gets set on these tasks, so no People fetch here.
                <BoardCard key={task.id} task={task} personName={undefined} onOpenCard={setOpenCardId} />
              ))}
            </div>
          )}
        </GlassPanel>

        <div className="min-w-0">
          <NotesForTarget targetType="course" targetId={course.id} />
        </div>
      </div>

      <BoardCardDetailDialog taskId={openCardId} onClose={() => setOpenCardId(null)} />
    </div>
  );
}
