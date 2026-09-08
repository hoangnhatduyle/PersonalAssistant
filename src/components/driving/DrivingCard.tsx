"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DeadlineTransitionMenu } from "@/components/deadlines/DeadlineTransitionMenu";
import { TaskTransitionMenu } from "@/components/tasks/TaskTransitionMenu";
import { SessionTransitionButtons } from "@/components/deadlines/SessionsSection";
import { useUpdateTodoItem } from "@/hooks/useTodoItems";
import { DEADLINE_STATUS_TONE, TASK_STATUS_TONE, SESSION_STATUS_TONE } from "@/lib/status-colors";
import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";
import type { DrivingQueueItem } from "@/lib/driving/build-driving-queue";

/** The raw row backing a queue item, looked up by DrivingHub -- null for an "event" (calendar occurrence with no completion action). */
export type DrivingCardRow = DeadlineRow | TaskRow | AppointmentRow | null;

type Props = {
  item: DrivingQueueItem;
  row: DrivingCardRow;
  /** Course name, custom to-do list name, or parent deadline name -- whatever "which course/parent this belongs to" context applies for the item's kind. */
  subtitle?: string;
  /** Task tags only. */
  tags?: string[];
};

const BADGE_CLASS = "w-fit px-4 py-1.5 text-base";
const ACTION_BUTTON_CLASS = "px-6 py-3 text-base";

function formatTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Its own component (not inline in the switch below) so useUpdateTodoItem is only ever called for a "todo" card, not conditionally inside DrivingCard's body. */
function MarkTodoDoneButton({ todoItemId }: { todoItemId: string }) {
  const { showToast } = useToast();
  const updateTodoItem = useUpdateTodoItem(todoItemId);

  const handleClick = async () => {
    try {
      await updateTodoItem.mutateAsync({ is_done: true });
      showToast("Marked done", "success");
    } catch {
      showToast("Could not update — try again", "error");
    }
  };

  return (
    <Button size="md" className={ACTION_BUTTON_CLASS} isLoading={updateTodoItem.isPending} onClick={handleClick}>
      Mark Done
    </Button>
  );
}

function cardBadgeAndActions(item: DrivingQueueItem, row: DrivingCardRow): { badge: ReactNode; actions: ReactNode } {
  switch (item.kind) {
    case "deadline": {
      const deadline = row as DeadlineRow;
      return {
        badge: (
          <Badge tone={DEADLINE_STATUS_TONE[deadline.status]} className={BADGE_CLASS}>
            {deadline.status}
          </Badge>
        ),
        actions: <DeadlineTransitionMenu deadlineId={deadline.id} status={deadline.status} size="lg" />,
      };
    }
    case "task": {
      const task = row as TaskRow;
      return {
        badge: (
          <Badge tone={TASK_STATUS_TONE[task.status]} className={BADGE_CLASS}>
            {task.status}
          </Badge>
        ),
        actions: <TaskTransitionMenu taskId={task.id} status={task.status} size="lg" />,
      };
    }
    case "session": {
      const session = row as AppointmentRow;
      const tone = session.session_status ? SESSION_STATUS_TONE[session.session_status] : "neutral";
      return {
        badge: (
          <Badge tone={tone} className={BADGE_CLASS}>
            {session.session_status ?? "Session"}
          </Badge>
        ),
        actions: <SessionTransitionButtons session={session} size="lg" />,
      };
    }
    case "todo":
      return { badge: null, actions: <MarkTodoDoneButton todoItemId={item.id} /> };
    case "event":
    case "reminder":
    default:
      return { badge: null, actions: null };
  }
}

export function DrivingCard({ item, row, subtitle, tags }: Props) {
  const router = useRouter();
  const { badge, actions } = cardBadgeAndActions(item, row);

  return (
    <GlassPanel variant="raised" className="flex h-96 w-full flex-col gap-4 overflow-y-auto p-8">
      <div className="flex flex-col gap-2">
        <span className="text-lg uppercase tracking-wide text-text-eyebrow">{formatTime(item.at)}</span>
        <h2 className="font-display text-3xl font-semibold text-text-primary">{item.title}</h2>
        {subtitle && <p className="text-base text-text-secondary">{subtitle}</p>}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} tone="neutral" className="text-sm">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {badge}
      </div>
      <div className="flex flex-wrap gap-3">
        {actions}
        {item.href && (
          <Button variant="secondary" size="md" className={ACTION_BUTTON_CLASS} onClick={() => router.push(item.href!)}>
            Open
          </Button>
        )}
      </div>
    </GlassPanel>
  );
}
