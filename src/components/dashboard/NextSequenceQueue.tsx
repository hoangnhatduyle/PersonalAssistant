import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { buildUpcomingItems } from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE } from "@/lib/status-colors";
import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
};

const QUEUE_LIMIT = 8;

/** Flat chronological Deadlines+Tasks list — no Reminders (those live in the Signal Inbox, not a due-date queue). */
export function NextSequenceQueue({ deadlines, tasks }: Props) {
  const items = buildUpcomingItems({ deadlines, tasks }).slice(0, QUEUE_LIMIT);
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
            const status = item.kind === "deadline" ? deadlineById.get(item.id)?.status : taskById.get(item.id)?.status;
            const tone = item.kind === "deadline" ? DEADLINE_STATUS_TONE[status as DeadlineRow["status"]] : TASK_STATUS_TONE[status as TaskRow["status"]];

            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col">
                  <Link href={item.href ?? "#"} className="truncate text-sm text-text-primary hover:underline">
                    {item.title}
                  </Link>
                  <span className="font-mono text-xs text-text-secondary">
                    {item.kind === "deadline" ? "Deadline" : "Task"} · {formatRelativeTime(item.at, now)}
                  </span>
                </div>
                {status && <StatusPill status={status} tone={tone} />}
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
