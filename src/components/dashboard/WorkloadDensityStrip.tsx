"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buildWorkloadDensity, itemsForDensityDay } from "@/lib/dashboard/workload-density";
import type { CourseRow, DeadlineRow, TaskRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  todoItems: TodoItemRow[];
  todoLists: TodoListRow[];
  courses: CourseRow[];
};

const WINDOW_DAYS = 7;
const BAR_MAX_HEIGHT_PX = 56;
/** Lowest same-day total worth calling out as a pile-up. */
const PILE_UP_THRESHOLD = 3;

function intensityClass(total: number): string {
  if (total === 0) return "bg-panel-border";
  if (total <= 2) return "bg-status-ok/60";
  if (total <= 4) return "bg-status-warn/70";
  return "bg-status-urgent";
}

/** "YYYY-MM-DD" -> "MM/DD" — a bare day number reads ambiguously once the strip spans a month boundary. */
function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

const KIND_LABEL: Record<"deadline" | "task" | "todo", string> = {
  deadline: "Deadline",
  task: "Task",
  todo: "To-Do",
};

/** Week-ahead view of how open items cluster by day — surfaces a pile-up before it's urgent. */
export function WorkloadDensityStrip({ deadlines, tasks, todoItems, todoLists, courses }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const buckets = useMemo(() => buildWorkloadDensity(deadlines, tasks, todoItems, WINDOW_DAYS), [deadlines, tasks, todoItems]);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const isEmpty = buckets.every((bucket) => bucket.total === 0);

  const densestBucket = buckets.reduce((densest, bucket) => (bucket.total > densest.total ? bucket : densest), buckets[0]);
  const showPileUpCallout = densestBucket && densestBucket.total >= PILE_UP_THRESHOLD;

  const selectedItems = selectedDate ? itemsForDensityDay(deadlines, tasks, todoItems, selectedDate, todoLists, courses) : [];

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Workload Ahead</p>
        {showPileUpCallout && (
          <p className="text-xs text-status-warn">
            {densestBucket.total} items converge on {formatShortDate(densestBucket.date)}
          </p>
        )}
      </div>

      {isEmpty ? (
        <EmptyState title="Nothing on the horizon" description="No deadlines, tasks, or to-dos due in the next 7 days." />
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            {buckets.map((bucket) => {
              const heightPx = Math.max(4, (bucket.total / max) * BAR_MAX_HEIGHT_PX);
              const isSelected = selectedDate === bucket.date;
              return (
                <button
                  key={bucket.date}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : bucket.date)}
                  aria-pressed={isSelected}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="flex h-14 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-6 rounded-t-sm transition-colors ${intensityClass(bucket.total)} ${
                        isSelected ? "ring-2 ring-accent-indigo" : ""
                      }`}
                      style={{ height: `${heightPx}px` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-text-secondary">{formatShortDate(bucket.date)}</span>
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <ul className="flex flex-col gap-2 border-t border-panel-border pt-3">
              {selectedItems.length === 0 ? (
                <li className="text-xs text-text-secondary">Nothing due this day.</li>
              ) : (
                selectedItems.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={item.href} className="truncate text-xs text-text-primary hover:underline">
                        {item.title}
                      </Link>
                      <span className="font-mono text-[10px] text-text-secondary">{KIND_LABEL[item.kind]}</span>
                    </div>
                    {(item.courseName || (item.tags && item.tags.length > 0)) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.courseName && <Badge tone="accent">{item.courseName}</Badge>}
                        {item.tags?.map((tag) => (
                          <Badge key={tag} tone="neutral">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </GlassPanel>
  );
}
