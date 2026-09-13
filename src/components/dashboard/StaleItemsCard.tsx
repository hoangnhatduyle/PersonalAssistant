"use client";

import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { buildStaleItems, type StaleItem } from "@/lib/dashboard/stale-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useAcknowledgeDeadline } from "@/hooks/useDeadlines";
import { useAcknowledgeTask } from "@/hooks/useTasks";
import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  appointments: AppointmentRow[];
};

const ITEM_LIMIT = 5;

const KIND_LABEL: Record<StaleItem["kind"], string> = {
  deadline: "Deadline",
  task: "Task",
};

type StaleRowProps = {
  item: StaleItem;
  now: Date;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
};

function StaleRow({ item, now, onAcknowledge, isAcknowledging }: StaleRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={item.href} className="truncate text-sm text-text-primary hover:underline">
          {item.title}
        </Link>
        <span className="font-mono text-xs text-text-secondary">
          {KIND_LABEL[item.kind]} · {formatRelativeTime(item.updatedAt, now)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onAcknowledge}
          disabled={isAcknowledging}
          className="font-mono text-[10px] text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Still on it
        </button>
        <Badge tone="warn">Stale</Badge>
      </div>
    </li>
  );
}

/**
 * Rules-of-Hooks means the acknowledge mutation (deadline vs task) can't be
 * picked conditionally inside a single .map() callback — each kind gets its
 * own tiny wrapper component instead.
 */
function StaleDeadlineRow({ item, now }: { item: StaleItem; now: Date }) {
  const acknowledge = useAcknowledgeDeadline(item.id);
  const { showToast } = useToast();
  const handleAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync();
      showToast("Marked as still on it", "success");
    } catch {
      showToast("Could not update that item", "error");
    }
  };
  return <StaleRow item={item} now={now} onAcknowledge={handleAcknowledge} isAcknowledging={acknowledge.isPending} />;
}

function StaleTaskRow({ item, now }: { item: StaleItem; now: Date }) {
  const acknowledge = useAcknowledgeTask(item.id);
  const { showToast } = useToast();
  const handleAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync();
      showToast("Marked as still on it", "success");
    } catch {
      showToast("Could not update that item", "error");
    }
  };
  return <StaleRow item={item} now={now} onAcknowledge={handleAcknowledge} isAcknowledging={acknowledge.isPending} />;
}

/**
 * Open items untouched for a while — a distinct "at risk" signal, separate
 * from MomentumCard's positive feed of recently-completed items. Completed/
 * Done/Cancelled items never appear here regardless of age: they're
 * resolved work, meant to be left alone, not neglected work. Staleness
 * thresholds scale with due-date proximity and Deadlines with a recent or
 * upcoming Session are suppressed — see stale-items.ts. The "still on it"
 * button lets a user reset the clock manually for work that happens off-app.
 */
export function StaleItemsCard({ deadlines, tasks, appointments }: Props) {
  const now = new Date();
  const items = buildStaleItems(deadlines, tasks, appointments, now);
  const visible = items.slice(0, ITEM_LIMIT);
  const remaining = items.length - visible.length;

  return (
    <GlassPanel variant="glow-warn" className="flex flex-col gap-4 p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-status-warn">At Risk</p>

      {items.length === 0 ? (
        <EmptyState title="Nothing stale" description="Every open item is on pace for its due date." />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-panel-border">
            {visible.map((item) =>
              item.kind === "deadline" ? (
                <StaleDeadlineRow key={`${item.kind}-${item.id}`} item={item} now={now} />
              ) : (
                <StaleTaskRow key={`${item.kind}-${item.id}`} item={item} now={now} />
              ),
            )}
          </ul>
          {remaining > 0 && <p className="text-xs text-text-secondary">+{remaining} more</p>}
        </>
      )}
    </GlassPanel>
  );
}
