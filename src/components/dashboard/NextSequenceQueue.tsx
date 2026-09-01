"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { buildUpcomingItems, filterUpcomingItemsByTimeWindow, type TimeWindowFilter } from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE } from "@/lib/status-colors";
import type { CourseRow, DeadlineRow, TaskRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  todoItems: TodoItemRow[];
  todoLists: TodoListRow[];
  courses: CourseRow[];
};

const QUEUE_LIMIT = 8;

const TIME_WINDOW_FILTERS: Array<{ value: TimeWindowFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "3days", label: "3 Days" },
  { value: "7days", label: "7 Days" },
  { value: "all", label: "All" },
];

const EMPTY_COPY: Record<TimeWindowFilter, { title: string; description: string }> = {
  today: { title: "Nothing due today", description: "No open deadlines or tasks due today." },
  tomorrow: { title: "Nothing due tomorrow", description: "No open deadlines or tasks due tomorrow." },
  "3days": { title: "Nothing due soon", description: "No open deadlines or tasks due in the next 3 days." },
  "7days": { title: "Nothing due this week", description: "No open deadlines or tasks due in the next 7 days." },
  all: { title: "Queue is clear", description: "No open deadlines or tasks with a due date." },
};

/** Flat chronological Deadlines+Tasks+course To-Do items list — no Reminders (those live in the Signal Inbox, not a due-date queue). */
export function NextSequenceQueue({ deadlines, tasks, todoItems, todoLists, courses }: Props) {
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>("today");
  const allItems = buildUpcomingItems({ deadlines, tasks, todoItems });
  const deadlineById = new Map(deadlines.map((deadline) => [deadline.id, deadline]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const todoItemCourseNameMap = useMemo(() => {
    const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
    const listCourseMap = new Map<string, string>();
    for (const list of todoLists) {
      if (list.course_id) {
        const name = courseNameById.get(list.course_id);
        if (name) listCourseMap.set(list.id, name);
      }
    }
    const result = new Map<string, string>();
    for (const item of todoItems) {
      const courseName = listCourseMap.get(item.list_id);
      if (courseName) result.set(item.id, courseName);
    }
    return result;
  }, [todoItems, todoLists, courses]);
  const now = new Date();
  const filtered = filterUpcomingItemsByTimeWindow(allItems, timeWindow, now);
  const items = timeWindow === "all" ? filtered : filtered.slice(0, QUEUE_LIMIT);
  const emptyCopy = EMPTY_COPY[timeWindow];

  return (
    <GlassPanel className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Next Sequence</p>
        <div role="group" aria-label="Filter by due date" className="flex flex-wrap items-center gap-2">
          {TIME_WINDOW_FILTERS.map((filter) => {
            const isActive = timeWindow === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setTimeWindow(filter.value)}
                className={`font-mono text-xs uppercase tracking-wide transition-colors ${
                  isActive ? "rounded-full bg-status-urgent px-2.5 py-1 text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
      ) : (
        <ul className="flex flex-col divide-y divide-panel-border">
          {items.map((item) => {
            const status = item.kind === "deadline" ? deadlineById.get(item.id)?.status : item.kind === "task" ? taskById.get(item.id)?.status : undefined;
            const tone = item.kind === "deadline" ? DEADLINE_STATUS_TONE[status as DeadlineRow["status"]] : item.kind === "task" ? TASK_STATUS_TONE[status as TaskRow["status"]] : undefined;
            // Deadlines already communicate "past due" via their own Overdue
            // status pill — Tasks/To-Do items have no such status, so they
            // need the explicit tag. Showing it for an Overdue deadline too
            // would be redundant with its pill.
            const showPastDueTag = item.urgent && item.kind !== "deadline";
            const kindLabel = item.kind === "deadline" ? "Deadline" : item.kind === "task" ? "Task" : "To-Do";

            const courseName = item.kind === "todo" ? todoItemCourseNameMap.get(item.id) : undefined;
            const taskTags = item.kind === "task" ? taskById.get(item.id)?.tags ?? [] : [];

            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={item.href ?? "#"} className="truncate text-sm text-text-primary hover:underline">
                    {item.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-text-secondary">
                      {kindLabel} · {formatRelativeTime(item.at, now)}
                    </span>
                    {courseName && <Badge tone="accent">{courseName}</Badge>}
                    {taskTags.map((tag) => (
                      <Badge key={tag} tone="neutral">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {showPastDueTag && (
                    <span className="rounded-full bg-status-urgent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-urgent">
                      Past due
                    </span>
                  )}
                  {status && <StatusPill status={status} tone={tone!} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
