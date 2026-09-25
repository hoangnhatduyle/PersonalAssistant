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
  type TimeWindowFilter,
  type UpcomingItem,
} from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatRingCountdown, ringFillFraction } from "@/lib/dashboard/countdown-rings";
import { DEADLINE_STATUS_TONE, EVENT_STATUS_TONE, SESSION_STATUS_TONE, TASK_STATUS_TONE, type StatusTone } from "@/lib/status-colors";
import { ITEM_KIND_BG_CLASS, ITEM_KIND_LABEL, ITEM_KIND_STROKE_CLASS } from "@/lib/dashboard/item-kind";
import { EventTransitionButtons } from "@/components/calendar/EventTransitionButtons";
import { MailInboxCard } from "@/components/dashboard/MailInboxCard";
import type { AppointmentRow, CourseRow, DeadlineRow, PersonRow, TaskRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  /** Tracked People (People feature) — for labeling a Task that belongs to someone other than the account owner. */
  people: PersonRow[];
  todoLists: TodoListRow[];
  courses: CourseRow[];
  /** Deadline Sessions — appointments rows tagged category "Session". */
  appointments: AppointmentRow[];
};

const RING_ITEM_LIMIT = 5;
const COUNTDOWN_TICK_MS = 1_000;
const CENTER = 150;
const RING_MIN_RADIUS = 44;
const RING_MAX_RADIUS = 108;
const RING_STROKE_WIDTH = 8;

const TIME_WINDOW_FILTERS: Array<{ value: TimeWindowFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "3days", label: "3 Days" },
  { value: "7days", label: "7 Days" },
  { value: "all", label: "All" },
];

const EMPTY_COPY: Record<TimeWindowFilter, { title: string; description: string }> = {
  today: { title: "Nothing due today", description: "No open deadlines or tasks due today." },
  tomorrow: { title: "Nothing due tomorrow", description: "No open deadlines or tasks due through tomorrow." },
  "3days": { title: "Nothing due soon", description: "No open deadlines or tasks due in the next 3 days." },
  "7days": { title: "Nothing due this week", description: "No open deadlines or tasks due in the next 7 days." },
  all: { title: "Queue is clear", description: "No open deadlines or tasks with a due date." },
};

/** Ring radii step outward from the center — index 0 (most urgent item) is the innermost ring. */
function ringRadius(index: number, count: number): number {
  if (count <= 1) return RING_MAX_RADIUS;
  const step = (RING_MAX_RADIUS - RING_MIN_RADIUS) / (count - 1);
  return RING_MIN_RADIUS + step * index;
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
 * Combined "Up Next" panel: countdown rings for the top 5 upcoming items on
 * the left, filterable upcoming-items queue on the right. Replaces the old
 * NowWidget + NextSequenceQueue pair to eliminate redundant item lists.
 */
export function UpNextPanel({ deadlines, tasks, people, todoLists, courses, appointments }: Props) {
  const isMounted = useIsMounted();
  const [, forceTick] = useState(0);
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>("today");
  /** The ring currently hovered/focused, anchored at its bounding box for the floating tooltip. */
  const [hoveredRing, setHoveredRing] = useState<{ item: UpcomingItem; x: number; y: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => forceTick((tick) => tick + 1), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const now = isMounted ? new Date() : null;

  // Countdown ring items (top 5 from all entity types, sessions included). Reminders are
  // deliberately excluded — they're just a notification echo of an underlying
  // Deadline/Task, which already appears here in its own right, so including both
  // showed the same item twice (see SignalInbox for the dedicated reminders view).
  const ringItems = buildUpcomingItems({ deadlines, tasks, appointments, people, courses }).slice(0, RING_ITEM_LIMIT);

  // Queue items (deadlines, tasks, sessions — full union, reminders excluded per above)
  const allQueueItems = buildUpcomingItems({ deadlines, tasks, appointments, people, courses });
  const deadlineById = new Map(deadlines.map((d) => [d.id, d]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const appointmentById = new Map(appointments.map((a) => [a.id, a]));

  /** Shared by the countdown rings' hover tooltip and the queue rows below — one status/tone lookup per item kind. */
  function resolveItemStatus(item: UpcomingItem): { status?: string; tone?: StatusTone } {
    const status =
      item.kind === "deadline"
        ? deadlineById.get(item.id)?.status
        : item.kind === "task"
          ? taskById.get(item.id)?.status
          : item.kind === "session"
            ? appointmentById.get(item.id)?.session_status
            : item.kind === "appointment"
              ? appointmentById.get(item.id)?.event_status
              : undefined;
    const tone =
      item.kind === "deadline"
        ? DEADLINE_STATUS_TONE[status as DeadlineRow["status"]]
        : item.kind === "task"
          ? TASK_STATUS_TONE[status as TaskRow["status"]]
          : item.kind === "session" && status
            ? SESSION_STATUS_TONE[status as NonNullable<AppointmentRow["session_status"]>]
            : item.kind === "appointment" && status
              ? EVENT_STATUS_TONE[status as NonNullable<AppointmentRow["event_status"]>]
              : undefined;
    return { status: status ?? undefined, tone };
  }

  function showRingTooltip(item: UpcomingItem, target: SVGCircleElement) {
    const rect = target.getBoundingClientRect();
    setHoveredRing({ item, x: rect.left + rect.width / 2, y: rect.top });
  }

  function hideRingTooltip() {
    setHoveredRing(null);
  }

  // Board merge: a Task can belong to a Board List (task.list_id) the same
  // way a Course To-Do item used to belong to a todo_lists row — resolve
  // that list's (and its course's) name for display the same way.
  const taskListLabelMap = useMemo(() => {
    const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
    const listInfoMap = new Map<string, { listName: string; courseName?: string }>();
    for (const list of todoLists) {
      const courseName = list.course_id ? courseNameById.get(list.course_id) : undefined;
      listInfoMap.set(list.id, { listName: list.name, courseName: courseName ?? undefined });
    }
    const result = new Map<string, { listName: string; courseName?: string }>();
    for (const task of tasks) {
      if (!task.list_id) continue;
      const info = listInfoMap.get(task.list_id);
      if (info) result.set(task.id, info);
    }
    return result;
  }, [tasks, todoLists, courses]);

  const queueItems = now ? filterUpcomingItemsByTimeWindow(allQueueItems, timeWindow, now) : allQueueItems;
  const emptyCopy = EMPTY_COPY[timeWindow];

  const heroItem = ringItems[0] ?? null;

  return (
    <GlassPanel variant="glow-ok" className="flex flex-col gap-6 p-6">
      <div className="flex h-full flex-col gap-6 lg:flex-row lg:items-stretch">
        {/* Countdown rings — 40% width on lg. Each ring is one of the top 5 upcoming
            items, innermost = most urgent, filling toward solid as its due time
            closes in over a fixed 24h window (see countdown-rings.ts) so fill level
            is comparable across items regardless of how long ago each was created. */}
        <div className="flex flex-col items-center justify-center gap-3 lg:w-2/5">
          <svg viewBox="0 0 300 300" aria-hidden="true" className="aspect-square h-auto w-full max-w-[26rem]">
            {now &&
              ringItems.map((item, index) => {
                const radius = ringRadius(index, ringItems.length);
                const circumference = 2 * Math.PI * radius;
                const fill = ringFillFraction(item.at, now, item.urgent);
                const strokeClass = item.urgent ? "stroke-status-urgent" : ITEM_KIND_STROKE_CLASS[item.kind];

                const isHovered = hoveredRing?.item.kind === item.kind && hoveredRing?.item.id === item.id;

                return (
                  <g key={`${item.kind}-${item.id}`}>
                    <circle
                      cx={CENTER}
                      cy={CENTER}
                      r={radius}
                      className={`fill-none stroke-panel-border/50 ${isHovered ? "stroke-panel-border" : ""}`}
                      strokeWidth={RING_STROKE_WIDTH}
                    />
                    {fill > 0 && (
                      <circle
                        cx={CENTER}
                        cy={CENTER}
                        r={radius}
                        className={`fill-none ${strokeClass} transition-[stroke-dashoffset] duration-500 ease-out`}
                        strokeWidth={RING_STROKE_WIDTH}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - fill)}
                        transform={`rotate(-90 ${CENTER} ${CENTER})`}
                      />
                    )}
                    {/* Wide, invisible hit area — the visible stroke is too thin to hover reliably. Hover/focus both open the same tooltip. */}
                    <circle
                      cx={CENTER}
                      cy={CENTER}
                      r={radius}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={RING_STROKE_WIDTH + 16}
                      style={{ pointerEvents: "stroke" }}
                      className="cursor-pointer focus:outline-none"
                      tabIndex={0}
                      role="button"
                      aria-label={`${ITEM_KIND_LABEL[item.kind]}: ${item.title}, ${formatRingCountdown(item.at, now, item.urgent)}`}
                      onMouseEnter={(e) => showRingTooltip(item, e.currentTarget)}
                      onMouseLeave={hideRingTooltip}
                      onFocus={(e) => showRingTooltip(item, e.currentTarget)}
                      onBlur={hideRingTooltip}
                    />
                  </g>
                );
              })}

            {heroItem && now && (
              <g>
                <text x={CENTER} y={CENTER - 6} textAnchor="middle" dominantBaseline="middle" className="fill-text-primary font-display text-2xl font-semibold">
                  {formatRingCountdown(heroItem.at, now, heroItem.urgent)}
                </text>
                <text
                  x={CENTER}
                  y={CENTER + 20}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-text-secondary font-mono text-[10px] uppercase tracking-wide"
                >
                  {truncate(heroItem.title, 20)}
                </text>
              </g>
            )}
          </svg>

          {hoveredRing && now && (
            <RingTooltip hovered={hoveredRing} now={now} resolveStatus={resolveItemStatus} />
          )}

          {ringItems.length > 0 && (
            <ul className="flex w-full max-w-[220px] flex-col gap-1">
              {ringItems.map((item) => (
                <li key={`${item.kind}-${item.id}-legend`} className="flex items-center gap-2 font-mono text-[10px]">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${item.urgent ? "bg-status-urgent" : ITEM_KIND_BG_CLASS[item.kind]}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-text-secondary">{item.title}</span>
                  <span className={item.urgent ? "text-status-urgent" : "text-text-eyebrow"}>
                    {now ? formatRingCountdown(item.at, now, item.urgent) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Divider: a hairline on narrow screens where the two blocks stack,
            a full-height rule on lg where they sit side by side — the two
            blocks read as one fused card without it. */}
        <div className="h-px w-full bg-panel-border lg:h-auto lg:w-px lg:self-stretch" aria-hidden="true" />

        {/* Filterable queue */}
        {/* Queue — 60% width on lg */}
        <div className="flex min-w-0 flex-col gap-3 pt-2 lg:w-3/5 lg:pt-0 lg:pl-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Up Next</p>
              {allQueueItems.some((item) => item.kind === "appointment") && (
                <p className="flex items-center gap-1.5 font-mono text-[10px]" title="Quick actions on event rows">
                  <span className="text-status-ok">✓ Done</span>
                  <span className="text-text-eyebrow">·</span>
                  <span className="text-status-urgent">✕ Missed</span>
                  {allQueueItems.some((item) => item.kind === "appointment" && item.courseConflict) && (
                    <>
                      <span className="text-text-eyebrow">·</span>
                      <span className="text-accent-indigo">Blue = suggested</span>
                    </>
                  )}
                </p>
              )}
            </div>
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
            <ul className="flex max-h-[20rem] flex-col divide-y divide-panel-border overflow-y-auto pr-1">
              {queueItems.map((item) => {
                const { status, tone } = resolveItemStatus(item);
                const showPastDueTag = item.urgent && item.kind !== "deadline";
                const taskListInfo = item.kind === "task" ? taskListLabelMap.get(item.id) : undefined;
                const kindLabel = ITEM_KIND_LABEL[item.kind];

                const listName = taskListInfo?.listName;
                const courseName = taskListInfo?.courseName;
                const taskTags = item.kind === "task" ? taskById.get(item.id)?.tags ?? [] : [];

                return (
                  <li key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
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
                        {/* A Board List named after its own course (e.g. "Machine Learning" list under a "Machine Learning" course) would otherwise show the same text twice. */}
                        {listName && listName !== courseName && <Badge tone="neutral">{listName}</Badge>}
                        {courseName && <Badge tone="accent">{courseName}</Badge>}
                        {item.kind === "task" && item.personId && <Badge tone="accent">For {item.personLabel}</Badge>}
                        {taskTags.map((tag) => (
                          <Badge key={tag} tone="neutral">{tag}</Badge>
                        ))}
                        {item.kind === "appointment" && item.conflict && <Badge tone="urgent">Conflict</Badge>}
                        {item.kind === "appointment" && item.courseConflict && <Badge tone="purple">Course Conflict</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {showPastDueTag && (
                        <span className="rounded-full bg-status-urgent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-urgent">
                          Past due
                        </span>
                      )}
                      {status && tone && <StatusPill status={status} tone={tone} />}
                      {item.kind === "appointment" && (
                        <EventTransitionButtons appointment={appointmentById.get(item.id)!} suggestMissed={item.courseConflict} compact />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Mail lives below the queue, inside its own column — not the
              full card width — so it stays on the "Up Next" side, next to
              (not under) the countdown rings. mt-auto pins it (and its
              divider) to the bottom of this column when the card is
              stretched taller than its content (e.g. to match MomentumCard's
              height) — the slack collects as a gap above the divider instead
              of as dead space below Mail. */}
          <div className="mt-auto h-px w-full bg-panel-border" aria-hidden="true" />
          <MailInboxCard />
        </div>
      </div>
    </GlassPanel>
  );
}

type RingTooltipProps = {
  hovered: { item: UpcomingItem; x: number; y: number };
  now: Date;
  resolveStatus: (item: UpcomingItem) => { status?: string; tone?: StatusTone };
};

/**
 * Floating detail card for a hovered/focused countdown ring. Anchored to the
 * hit circle's bounding box (fixed positioning), not the cursor — GlassPanel
 * has no transform/filter, so `position: fixed` stays viewport-relative.
 */
function RingTooltip({ hovered, now, resolveStatus }: RingTooltipProps) {
  const { item, x, y } = hovered;
  const { status, tone } = resolveStatus(item);
  const fullDateTime = item.at.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="pointer-events-none fixed z-50 w-max max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-panel-border bg-panel px-3 py-2 shadow-panel-raised"
      style={{ left: x, top: y }}
      role="tooltip"
    >
      <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">
        {ITEM_KIND_LABEL[item.kind]} · {formatRingCountdown(item.at, now, item.urgent)}
      </p>
      <p className="mt-1 font-mono text-[10px] text-text-secondary">{fullDateTime}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {item.urgent && (
          <span className="rounded-full bg-status-urgent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-urgent">
            Past due
          </span>
        )}
        {status && tone && <StatusPill status={status} tone={tone} />}
        {item.kind === "task" && item.personId && <Badge tone="accent">For {item.personLabel}</Badge>}
        {item.kind === "appointment" && item.conflict && <Badge tone="urgent">Conflict</Badge>}
        {item.kind === "appointment" && item.courseConflict && <Badge tone="purple">Course Conflict</Badge>}
      </div>
    </div>
  );
}
