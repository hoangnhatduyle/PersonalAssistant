"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { buildStaleItems, type StaleItem } from "@/lib/dashboard/stale-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useAcknowledgeDeadline } from "@/hooks/useDeadlines";
import { useAcknowledgeTask } from "@/hooks/useTasks";
import type { StatusTone } from "@/lib/status-colors";
import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  appointments: AppointmentRow[];
  /** Last-touched-via-checklist/attachment/note per task id — see buildStaleItems. */
  taskActivity?: Map<string, Date>;
};

const ITEM_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Ratio at which a merely-stale item is treated as urgently stale (double its expected check-in cadence). */
const NEGLECT_URGENT_RATIO = 2;
/** Matches the widest tier boundary in stale-items.ts's STALE_TIERS. */
const DUE_WINDOW_DAYS = 21;

const KIND_LABEL: Record<StaleItem["kind"], string> = {
  deadline: "Deadline",
  task: "Task",
};

function dueLabel(dueAt: Date | null, now: Date): string {
  if (!dueAt) return "No due date";
  const relative = formatRelativeTime(dueAt, now);
  return relative.endsWith(" ago") ? `Overdue by ${relative.replace(" ago", "")}` : `Due ${relative}`;
}

function severityTone(neglectRatio: number): StatusTone {
  return neglectRatio >= NEGLECT_URGENT_RATIO ? "urgent" : "warn";
}

/**
 * Every item in this list already has neglectRatio >= 1 (that's the
 * inclusion threshold in stale-items.ts), so a naive min(1, ratio) clamp
 * would render every bar fully filled with no gradient. Map the meaningful
 * range [1, 3] onto fill [0.25, 1] instead.
 */
function neglectFill(neglectRatio: number): number {
  const clamped = Math.min(neglectRatio, 3);
  return 0.25 + ((clamped - 1) / 2) * 0.75;
}

function daysUntilDue(dueAt: Date, now: Date): number {
  return (dueAt.getTime() - now.getTime()) / DAY_MS;
}

function dueFill(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  const days = daysUntilDue(dueAt, now);
  if (days <= 0) return 1;
  return Math.max(0, 1 - days / DUE_WINDOW_DAYS);
}

function dueTone(dueAt: Date | null, now: Date): StatusTone {
  if (!dueAt) return "neutral";
  const days = daysUntilDue(dueAt, now);
  if (days <= 0) return "urgent";
  if (days <= 3) return "warn";
  if (days <= DUE_WINDOW_DAYS) return "accent";
  return "neutral";
}

type StaleRowProps = {
  item: StaleItem;
  now: Date;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
};

function StaleRow({ item, now, onAcknowledge, isAcknowledging }: StaleRowProps) {
  const tone = severityTone(item.neglectRatio);
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={item.href} className="truncate text-sm text-text-primary hover:underline">
            {item.title}
          </Link>
          <span className="font-mono text-xs text-text-secondary">
            {KIND_LABEL[item.kind]} · {dueLabel(item.dueAt, now)}
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
          <Badge tone={tone}>Stale</Badge>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-wide text-text-secondary">Neglect</span>
          <ProgressBar value={neglectFill(item.neglectRatio)} tone={tone} className="h-1" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-wide text-text-secondary">Due</span>
          <ProgressBar value={dueFill(item.dueAt, now)} tone={dueTone(item.dueAt, now)} className="h-1" />
        </div>
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
export function StaleItemsCard({ deadlines, tasks, appointments, taskActivity }: Props) {
  const [expanded, setExpanded] = useState(false);
  const now = new Date();
  const items = buildStaleItems(deadlines, tasks, appointments, taskActivity ?? new Map(), now);
  const visible = expanded ? items : items.slice(0, ITEM_LIMIT);

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
          {items.length > ITEM_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
            >
              {expanded ? "Show less" : `Show all (${items.length})`}
            </button>
          )}
        </>
      )}
    </GlassPanel>
  );
}
