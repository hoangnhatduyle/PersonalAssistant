"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import {
  buildUpcomingItems,
  filterUpcomingItemsByTimeWindow,
  type UpcomingItem,
  type TimeWindowFilter,
} from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE } from "@/lib/status-colors";
import type { CourseRow, DeadlineRow, ReminderRow, TaskRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  reminders: ReminderRow[];
  todoItems: TodoItemRow[];
  todoLists: TodoListRow[];
  courses: CourseRow[];
};

const RING_ITEM_LIMIT = 5;
const QUEUE_LIMIT = 8;
const CLOCK_TICK_MS = 1_000;
const CENTER = 150;
const FACE_RADIUS = 100;
const RING_RADIUS = 108;
const DOT_RADIUS = 128;
const LABEL_RADIUS = 148;
const HOUR_HAND_LENGTH = 54;
const MINUTE_HAND_LENGTH = 80;
const HOUR_TICK_INNER = FACE_RADIUS - 12;
const MINUTE_TICK_INNER = FACE_RADIUS - 5;

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

const KIND_FILL_CLASS: Record<UpcomingItem["kind"], string> = {
  deadline: "fill-status-urgent",
  task: "fill-accent-indigo",
  reminder: "fill-accent-teal",
  todo: "fill-accent-violet",
};

function clockHandAngles(now: Date): { hour: number; minute: number } {
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  return {
    hour: (hours + minutes / 60 + seconds / 3600) * 30,
    minute: (minutes + seconds / 60) * 6,
  };
}

function polarPoint(radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

function truncate(title: string, max = 16): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

const subscribeNoop = () => () => {};

function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * Combined "Up Next" panel: live clock with radial dots on the left,
 * filterable upcoming-items queue on the right. Replaces the old
 * NowWidget + NextSequenceQueue pair to eliminate redundant item lists.
 */
export function UpNextPanel({ deadlines, tasks, reminders, todoItems, todoLists, courses }: Props) {
  const isMounted = useIsMounted();
  const [, forceTick] = useState(0);
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>("today");

  useEffect(() => {
    const id = setInterval(() => forceTick((tick) => tick + 1), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const now = isMounted ? new Date() : null;

  // Clock ring items (top 5 from all entity types including reminders)
  const ringItems = buildUpcomingItems({ deadlines, tasks, reminders }).slice(0, RING_ITEM_LIMIT);

  // Queue items (deadlines, tasks, todos, reminders — full union)
  const allQueueItems = buildUpcomingItems({ deadlines, tasks, reminders, todoItems });
  const deadlineById = new Map(deadlines.map((d) => [d.id, d]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const todoItemLabelMap = useMemo(() => {
    const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
    const listInfoMap = new Map<string, { listName: string; courseName?: string }>();
    for (const list of todoLists) {
      const courseName = list.course_id ? courseNameById.get(list.course_id) : undefined;
      listInfoMap.set(list.id, { listName: list.name, courseName: courseName ?? undefined });
    }
    const result = new Map<string, { listName: string; courseName?: string }>();
    for (const item of todoItems) {
      const info = listInfoMap.get(item.list_id);
      if (info) result.set(item.id, info);
    }
    return result;
  }, [todoItems, todoLists, courses]);

  const filtered = now ? filterUpcomingItemsByTimeWindow(allQueueItems, timeWindow, now) : allQueueItems;
  const queueItems = timeWindow === "all" ? filtered : filtered.slice(0, QUEUE_LIMIT);
  const emptyCopy = EMPTY_COPY[timeWindow];

  const minuteIndices = Array.from({ length: 60 }, (_, index) => index * 6);
  const hands = now ? clockHandAngles(now) : null;
  const hourTip = hands ? polarPoint(HOUR_HAND_LENGTH, hands.hour) : null;
  const minuteTip = hands ? polarPoint(MINUTE_HAND_LENGTH, hands.minute) : null;

  return (
    <GlassPanel variant="glow-ok" className="flex flex-col gap-6 p-6 lg:flex-row lg:items-stretch">
      {/* Clock — 40% width on lg */}
      <div className="flex flex-col items-center justify-center gap-3 lg:w-2/5">
        <svg viewBox="0 0 300 300" aria-hidden="true" className="h-64 w-64">
          <circle cx={CENTER} cy={CENTER} r={FACE_RADIUS} className="fill-panel/30 stroke-panel-border/60" strokeWidth={1} />
          <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} className="fill-none stroke-panel-border" strokeWidth={1} />

          {minuteIndices.map((angle) => {
            const isHour = angle % 30 === 0;
            const inner = polarPoint(isHour ? HOUR_TICK_INNER : MINUTE_TICK_INNER, angle);
            const outer = polarPoint(FACE_RADIUS, angle);
            return (
              <line
                key={angle}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className={isHour ? "stroke-text-secondary" : "stroke-text-eyebrow/80"}
                strokeWidth={isHour ? 1.5 : 0.75}
                strokeLinecap="round"
              />
            );
          })}

          {hourTip && minuteTip && (
            <g>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={hourTip.x}
                y2={hourTip.y}
                className="stroke-text-primary"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              <line
                x1={CENTER}
                y1={CENTER}
                x2={minuteTip.x}
                y2={minuteTip.y}
                className="stroke-accent-teal"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle cx={CENTER} cy={CENTER} r={4} className="fill-bg-void stroke-accent-teal" strokeWidth={1.5} />
            </g>
          )}

          {ringItems.map((item, index) => {
            const angle = (360 / ringItems.length) * index;
            const dot = polarPoint(DOT_RADIUS, angle);
            const label = polarPoint(LABEL_RADIUS, angle);
            const anchor = label.x < CENTER - 4 ? "end" : label.x > CENTER + 4 ? "start" : "middle";

            return (
              <g key={`${item.kind}-${item.id}`}>
                <circle cx={dot.x} cy={dot.y} r={5} className={item.urgent ? "fill-status-urgent" : KIND_FILL_CLASS[item.kind]} />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-text-secondary font-mono text-[9px]"
                >
                  {truncate(item.title)}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="text-center" role="timer" aria-live="off">
          <p className="font-display text-2xl font-semibold text-text-primary">
            {now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--"}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wide text-text-secondary">
            {now ? now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) : ""}
          </p>
        </div>
      </div>

      {/* Filterable queue */}
      {/* Queue — 60% width on lg */}
      <div className="flex min-w-0 flex-col gap-3 lg:w-3/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Up Next</p>
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

        {queueItems.length === 0 ? (
          <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
        ) : (
          <ul className="flex flex-col divide-y divide-panel-border">
            {queueItems.map((item) => {
              const status =
                item.kind === "deadline"
                  ? deadlineById.get(item.id)?.status
                  : item.kind === "task"
                    ? taskById.get(item.id)?.status
                    : undefined;
              const tone =
                item.kind === "deadline"
                  ? DEADLINE_STATUS_TONE[status as DeadlineRow["status"]]
                  : item.kind === "task"
                    ? TASK_STATUS_TONE[status as TaskRow["status"]]
                    : undefined;
              const showPastDueTag = item.urgent && item.kind !== "deadline";
              const todoInfo = item.kind === "todo" ? todoItemLabelMap.get(item.id) : undefined;
              const kindLabel =
                item.kind === "deadline"
                  ? "Deadline"
                  : item.kind === "task"
                    ? "Task"
                    : item.kind === "reminder"
                      ? "Reminder"
                      : todoInfo?.listName ?? "To-Do";

              const courseName = todoInfo?.courseName;
              const taskTags = item.kind === "task" ? taskById.get(item.id)?.tags ?? [] : [];

              return (
                <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-1">
                    {item.href ? (
                      <Link href={item.href} className="truncate text-sm text-text-primary hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <span className="truncate text-sm text-text-primary">{item.title}</span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-text-secondary">
                        {kindLabel} · {now ? formatRelativeTime(item.at, now) : ""}
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
                    {status && tone && <StatusPill status={status} tone={tone} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassPanel>
  );
}
