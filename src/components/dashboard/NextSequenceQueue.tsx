import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { buildUpcomingItems } from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE } from "@/lib/status-colors";
import type { DeadlineRow, TaskRow, TodoItemRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  todoItems: TodoItemRow[];
};

const QUEUE_LIMIT = 8;

/** Flat chronological Deadlines+Tasks+course To-Do items list — no Reminders (those live in the Signal Inbox, not a due-date queue). */
export function NextSequenceQueue({ deadlines, tasks, todoItems }: Props) {
  const items = buildUpcomingItems({ deadlines, tasks, todoItems }).slice(0, QUEUE_LIMIT);
  const deadlineById = new Map(deadlines.map((deadline) => [deadline.id, deadline]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const now = new Date();

  return (
    <GlassPanel className="flex flex-col gap-3 p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Next Sequence</p>

      {items.length === 0 ? (
        <EmptyState title="Queue is clear" description="No open deadlines or tasks with a due date." />
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

            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col">
                  <Link href={item.href ?? "#"} className="truncate text-sm text-text-primary hover:underline">
                    {item.title}
                  </Link>
                  <span className="font-mono text-xs text-text-secondary">
                    {kindLabel} · {formatRelativeTime(item.at, now)}
                  </span>
                </div>
                {showPastDueTag && (
                  <span className="shrink-0 rounded-full bg-status-urgent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-urgent">
                    Past due
                  </span>
                )}
                {status && <StatusPill status={status} tone={tone!} />}
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
