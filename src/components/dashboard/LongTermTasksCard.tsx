"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useAcknowledgeTask, useTransitionTask } from "@/hooks/useTasks";
import { buildLongTermItems, formatTouchedLabel, type LongTermItem } from "@/lib/dashboard/long-term-items";
import type { TaskRow } from "@/lib/api/entity-types";

type Props = {
  /** The account owner's own Tasks (a tracked Person's Tasks never belong on this card). */
  tasks: TaskRow[];
  /** Last-touched-via-checklist/attachment/note per task id — see buildLongTermItems. */
  taskActivity?: Map<string, Date>;
};

/** How long the "Done?" confirm state stays armed before reverting. */
const CONFIRM_WINDOW_MS = 3_000;
const EMPTY_ACTIVITY = new Map<string, Date>();

function LongTermRow({ item }: { item: LongTermItem }) {
  const acknowledge = useAcknowledgeTask(item.id);
  const transition = useTransitionTask(item.id);
  const { showToast } = useToast();
  // Done is terminal for a Task (guard_task_status), so the check needs a second click.
  const [confirmingDone, setConfirmingDone] = useState(false);

  useEffect(() => {
    if (!confirmingDone) return;
    const id = setTimeout(() => setConfirmingDone(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(id);
  }, [confirmingDone]);

  const handleStillOnIt = async () => {
    try {
      await acknowledge.mutateAsync();
      showToast("Marked as still on it", "success");
    } catch {
      showToast("Could not update that task", "error");
    }
  };

  const handleDone = async () => {
    if (!confirmingDone) {
      setConfirmingDone(true);
      return;
    }
    setConfirmingDone(false);
    try {
      await transition.mutateAsync("user_marks_done");
      showToast("Marked done", "success");
    } catch {
      showToast("Could not mark that task done", "error");
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm bg-accent-violet/80" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={item.href} className="truncate text-sm text-text-primary hover:underline">
            {item.title}
          </Link>
          <span className="font-mono text-[10px] text-text-secondary">{formatTouchedLabel(item.daysSinceTouched)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={handleStillOnIt}
          disabled={acknowledge.isPending}
          className="rounded-control border border-panel-border px-2 py-1 font-mono text-[10px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          Still on it
        </button>
        <button
          type="button"
          onClick={handleDone}
          disabled={transition.isPending}
          aria-label={confirmingDone ? `Confirm: mark ${item.title} done` : `Mark ${item.title} done`}
          className={`rounded-control border px-2 py-1 font-mono text-[10px] transition-colors disabled:opacity-50 ${
            confirmingDone
              ? "border-status-ok bg-status-ok/15 text-status-ok"
              : "border-panel-border text-status-ok hover:border-status-ok/50"
          }`}
        >
          {confirmingDone ? "Done?" : "✓"}
        </button>
      </div>
    </li>
  );
}

/**
 * Passive "keep this on my radar" list for Tasks flagged is_long_term
 * (supabase/migrations/0056_long_term_tasks.sql). Deliberately quiet: no
 * countdown, no red, no due/overdue wording — these tasks have no due date by
 * definition, so the only time signal is how long since you last touched one.
 * Longest-untouched leads (see buildLongTermItems). Lives under the countdown
 * rings in UpNextPanel's left column.
 */
export function LongTermTasksCard({ tasks, taskActivity = EMPTY_ACTIVITY }: Props) {
  const items = buildLongTermItems(tasks, taskActivity);

  return (
    <section aria-label="Long-term tasks" className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-accent-violet">Long-term tasks</p>
        {items.length > 0 && <span className="font-mono text-[10px] text-text-secondary">{items.length} on radar</span>}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-text-secondary">
          Nothing on your radar. Mark a task as long-term in its card to keep it here without a due date.
        </p>
      ) : (
        <ul className="flex max-h-60 flex-col divide-y divide-panel-border overflow-y-auto pr-1">
          {items.map((item) => (
            <LongTermRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
