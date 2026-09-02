import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { buildCourseProgress } from "@/lib/dashboard/course-progress";
import type { CourseRow, DeadlineRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  courses: CourseRow[];
  deadlines: DeadlineRow[];
  todoItems: TodoItemRow[];
  todoLists: TodoListRow[];
};

const COURSE_LIMIT = 5;

/** Completion broken out by course — Deadlines + course To-Do items; Tasks aren't linked to a course. */
export function CourseProgressList({ courses, deadlines, todoItems, todoLists }: Props) {
  const progress = buildCourseProgress(courses, deadlines, todoItems, todoLists);
  const visible = progress.slice(0, COURSE_LIMIT);
  const remaining = progress.length - visible.length;

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">By Course</p>

      {progress.length === 0 ? (
        <EmptyState title="No course activity yet" description="Deadlines and course to-dos will show progress here." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((course) => (
              <li key={course.courseId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/courses/${course.courseId}`} className="truncate text-sm text-text-primary hover:underline">
                    {course.courseCode ?? course.courseName}
                  </Link>
                  <span className="font-mono text-xs text-text-secondary">
                    {course.done}/{course.total}
                  </span>
                </div>
                <ProgressBar value={course.ratio} label={`${course.courseName} progress`} />
              </li>
            ))}
          </ul>
          {remaining > 0 && <p className="text-xs text-text-secondary">+{remaining} more</p>}
          <p className="text-[10px] text-text-secondary">Excludes tasks — not linked to a course.</p>
        </>
      )}
    </GlassPanel>
  );
}
