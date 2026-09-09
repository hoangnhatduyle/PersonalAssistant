"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buildWorkloadDensity, itemsForDensityDay, countPastDueItems, pastDueItemsFor } from "@/lib/dashboard/workload-density";
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

/** Stacked-segment order, fixed so the legend and each bar's stack always agree. Avoids status-urgent — that's reserved for the past-due indicator. */
const KIND_ORDER: Array<"deadline" | "task" | "todo"> = ["deadline", "task", "todo"];

const KIND_SEGMENT_CLASS: Record<"deadline" | "task" | "todo", string> = {
  deadline: "bg-accent-teal",
  task: "bg-accent-indigo",
  todo: "bg-accent-violet",
};

/** Week-ahead view of how open items cluster by day — surfaces a pile-up before it's urgent. */
export function WorkloadDensityStrip({ deadlines, tasks, todoItems, todoLists, courses }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showPastDue, setShowPastDue] = useState(false);
  const buckets = useMemo(() => buildWorkloadDensity(deadlines, tasks, todoItems, WINDOW_DAYS), [deadlines, tasks, todoItems]);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const isEmpty = buckets.every((bucket) => bucket.total === 0);

  const densestBucket = buckets.reduce((densest, bucket) => (bucket.total > densest.total ? bucket : densest), buckets[0]);
  const showPileUpCallout = densestBucket && densestBucket.total >= PILE_UP_THRESHOLD;

  const pastDueSummary = useMemo(() => countPastDueItems(deadlines, tasks, todoItems), [deadlines, tasks, todoItems]);

  const selectedItems = selectedDate ? itemsForDensityDay(deadlines, tasks, todoItems, selectedDate, todoLists, courses) : [];
  const pastDueItems = showPastDue ? pastDueItemsFor(deadlines, tasks, todoItems, todoLists, courses) : [];
  const activeItems = selectedDate ? selectedItems : showPastDue ? pastDueItems : null;

  function selectDate(date: string) {
    setShowPastDue(false);
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  function togglePastDue() {
    setSelectedDate(null);
    setShowPastDue((prev) => !prev);
  }

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Workload Ahead</p>
          {pastDueSummary.count > 0 && (
            <button
              type="button"
              onClick={togglePastDue}
              aria-pressed={showPastDue}
              className="rounded-full bg-status-urgent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-urgent transition-colors hover:bg-status-urgent/25"
            >
              Past due · {pastDueSummary.count}
            </button>
          )}
        </div>
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
                  onClick={() => selectDate(bucket.date)}
                  aria-pressed={isSelected}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="flex h-14 w-full items-end justify-center">
                    <div
                      className={`flex w-full max-w-6 flex-col-reverse overflow-hidden rounded-t-sm transition-colors ${
                        isSelected ? "ring-2 ring-accent-indigo" : ""
                      }`}
                      style={{ height: `${heightPx}px` }}
                    >
                      {bucket.total === 0 ? (
                        <div className="h-full w-full bg-panel-border" />
                      ) : (
                        KIND_ORDER.filter((kind) => bucket[`${kind}Count`] > 0).map((kind) => (
                          <div
                            key={kind}
                            className={KIND_SEGMENT_CLASS[kind]}
                            style={{ height: `${(bucket[`${kind}Count`] / bucket.total) * 100}%` }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-text-secondary">{formatShortDate(bucket.date)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {KIND_ORDER.map((kind) => (
              <span key={kind} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-text-secondary">
                <span className={`h-2 w-2 rounded-full ${KIND_SEGMENT_CLASS[kind]}`} />
                {KIND_LABEL[kind]}
              </span>
            ))}
          </div>

          {activeItems && (
            <div className="flex flex-col gap-2 border-t border-panel-border pt-3">
              {showPastDue && <p className="font-mono text-[10px] uppercase tracking-wide text-status-urgent">Past due</p>}
              <ul className="flex flex-col gap-2">
                {activeItems.length === 0 ? (
                  <li className="text-xs text-text-secondary">{showPastDue ? "Nothing past due." : "Nothing due this day."}</li>
                ) : (
                  activeItems.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={item.href} className="truncate text-xs text-text-primary hover:underline">
                          {item.title}
                        </Link>
                        <span className="font-mono text-[10px] text-text-secondary">{KIND_LABEL[item.kind]}</span>
                      </div>
                      {(item.listName || item.courseName || (item.tags && item.tags.length > 0)) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* A list named after its own course (e.g. "Machine Learning" list under a "Machine Learning" course) would otherwise show the same text twice. */}
                          {item.listName && item.listName !== item.courseName && <Badge tone="neutral">{item.listName}</Badge>}
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
            </div>
          )}
        </>
      )}
    </GlassPanel>
  );
}
