import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buildStaleItems, type StaleItem } from "@/lib/dashboard/stale-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { DeadlineRow, TaskRow, TodoItemRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  todoItems: TodoItemRow[];
};

const STALE_AFTER_DAYS = 7;
const ITEM_LIMIT = 5;

const KIND_LABEL: Record<StaleItem["kind"], string> = {
  deadline: "Deadline",
  task: "Task",
  todo: "To-Do",
};

/**
 * Open items untouched for a while — a distinct "at risk" signal, separate
 * from MomentumCard's positive feed of recently-completed items. Completed/
 * Done/Cancelled items never appear here regardless of age: they're
 * resolved work, meant to be left alone, not neglected work.
 */
export function StaleItemsCard({ deadlines, tasks, todoItems }: Props) {
  const now = new Date();
  const items = buildStaleItems(deadlines, tasks, todoItems, STALE_AFTER_DAYS, now);
  const visible = items.slice(0, ITEM_LIMIT);
  const remaining = items.length - visible.length;

  return (
    <GlassPanel variant="glow-warn" className="flex flex-col gap-4 p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-status-warn">At Risk</p>

      {items.length === 0 ? (
        <EmptyState title="Nothing stale" description="Every open item has been touched in the last week." />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-panel-border">
            {visible.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={item.href} className="truncate text-sm text-text-primary hover:underline">
                    {item.title}
                  </Link>
                  <span className="font-mono text-xs text-text-secondary">
                    {KIND_LABEL[item.kind]} · {formatRelativeTime(item.updatedAt, now)}
                  </span>
                </div>
                <Badge tone="warn" className="shrink-0">
                  Stale
                </Badge>
              </li>
            ))}
          </ul>
          {remaining > 0 && <p className="text-xs text-text-secondary">+{remaining} more</p>}
        </>
      )}
    </GlassPanel>
  );
}
