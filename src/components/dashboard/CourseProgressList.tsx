"use client";

import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { buildCourseProgress } from "@/lib/dashboard/course-progress";
import { buildBoardProgress } from "@/lib/dashboard/board-progress";
import type { CourseRow, DeadlineRow, TaskRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  courses: CourseRow[];
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  todoLists: TodoListRow[];
};

type ProgressView = "course" | "board";

const ROW_LIMIT = 5;

const VIEW_TABS: Array<{ value: ProgressView; label: string }> = [
  { value: "course", label: "Course" },
  { value: "board", label: "Board" },
];

/** Shared row shape between the Course and Board views, so one list of <li> markup renders either. */
type ProgressRow = { id: string; label: string; sublabel: string | null; done: number; total: number; ratio: number; href: string };

/**
 * Per-course or per-board-list completion, toggled by the viewer — By
 * Course rolls Deadlines and listed Tasks up to a course (buildCourseProgress);
 * By Board tallies every Board List directly (buildBoardProgress), including
 * freestanding/personal lists that have no course_id and so never show up
 * in the Course view. Choice persists across reloads (useLocalStorage) since
 * it's a per-viewer display preference, not shared state.
 */
export function CourseProgressList({ courses, deadlines, tasks, todoLists }: Props) {
  const [view, setView] = useLocalStorage<ProgressView>("dashboard.progressListView", "course");

  const rows: ProgressRow[] =
    view === "course"
      ? buildCourseProgress(courses, deadlines, tasks, todoLists).map((course) => ({
          id: course.courseId,
          label: course.courseCode ?? course.courseName,
          sublabel: course.courseName,
          done: course.done,
          total: course.total,
          ratio: course.ratio,
          href: `/courses/${course.courseId}`,
        }))
      : buildBoardProgress(todoLists, tasks).map((list) => ({
          id: list.listId,
          label: list.listName,
          sublabel: null,
          done: list.done,
          total: list.total,
          ratio: list.ratio,
          href: "/board",
        }));

  const visible = rows.slice(0, ROW_LIMIT);
  const remaining = rows.length - visible.length;

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">By {view === "course" ? "Course" : "Board"}</p>
        <div className="flex items-center gap-1 rounded-full border border-panel-border p-0.5">
          {VIEW_TABS.map((tab) => {
            const isActive = view === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setView(tab.value)}
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  isActive ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={view === "course" ? "No course activity yet" : "No board activity yet"}
          description={view === "course" ? "Deadlines and board cards will show progress here." : "Cards filed under a Board List will show progress here."}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={row.href} className="truncate text-sm text-text-primary hover:underline">
                    {row.label}
                  </Link>
                  <span className="font-mono text-xs text-text-secondary">
                    {row.done}/{row.total}
                  </span>
                </div>
                <ProgressBar value={row.ratio} label={`${row.sublabel ?? row.label} progress`} />
              </li>
            ))}
          </ul>
          {remaining > 0 && <p className="text-xs text-text-secondary">+{remaining} more</p>}
          <p className="text-[10px] text-text-secondary">
            {view === "course" ? "Excludes tasks not filed under a course's board list." : "Excludes tasks not filed under any Board List."}
          </p>
        </>
      )}
    </GlassPanel>
  );
}
