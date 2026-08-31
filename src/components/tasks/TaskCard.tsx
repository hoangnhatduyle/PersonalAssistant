import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { TASK_STATUS_TONE } from "@/lib/status-colors";
import { TaskTransitionMenu } from "@/components/tasks/TaskTransitionMenu";
import { FeedbackControl } from "@/components/feedback/FeedbackControl";
import type { TaskRow } from "@/lib/api/entity-types";

type Props = {
  task: TaskRow;
};

export function TaskCard({ task }: Props) {
  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/tasks/${task.id}`} className="font-display text-base font-medium text-text-primary hover:underline">
            {task.title}
          </Link>
          {task.due_at && (
            <p className="mt-0.5 font-mono text-xs text-text-secondary">Due {new Date(task.due_at).toLocaleString()}</p>
          )}
        </div>
        <StatusPill status={task.status} tone={TASK_STATUS_TONE[task.status]} />
      </div>
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}
      <TaskTransitionMenu taskId={task.id} status={task.status} />
      {task.status === "Done" && <FeedbackControl targetType="task" targetId={task.id} />}
    </GlassPanel>
  );
}
