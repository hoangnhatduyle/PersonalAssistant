"use client";

import { useState } from "react";
import Link from "next/link";
import { useCourse, useUpdateCourse } from "@/hooks/useCourses";
import { useDeadlines } from "@/hooks/useDeadlines";
import { CourseForm } from "@/components/courses/CourseForm";
import { DeleteCourseButton } from "@/components/courses/DeleteCourseButton";
import { DeadlineList } from "@/components/deadlines/DeadlineList";
import { NotesForTarget } from "@/components/notes/NotesForTarget";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { CoursePayload } from "@/lib/api/schemas";

type Props = {
  courseId: string;
};

export function CourseDetailContainer({ courseId }: Props) {
  const { data: course, isLoading } = useCourse(courseId);
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines({ courseId });
  const updateCourse = useUpdateCourse(courseId);
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!course) return <p className="text-sm text-text-secondary">Course not found.</p>;

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
            {course.meeting_pattern && <p className="mt-1 text-sm text-text-secondary">{course.meeting_pattern}</p>}
            {course.location && <p className="text-sm text-text-secondary">{course.location}</p>}
            {course.instructor && <p className="text-sm text-text-secondary">{course.instructor}</p>}
          </div>
          <Badge tone={course.reminders_enabled ? "ok" : "neutral"}>
            {course.reminders_enabled ? `Reminders ${course.reminder_lead_minutes}m lead` : "Reminders off"}
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
          <Link href="/deadlines" className="text-xs text-accent-indigo hover:underline">
            View all
          </Link>
        </div>
        {deadlinesLoading ? <Skeleton className="h-24 w-full" /> : <DeadlineList deadlines={deadlines?.rows ?? []} />}
      </GlassPanel>

      <NotesForTarget targetType="course" targetId={course.id} />
    </div>
  );
}
