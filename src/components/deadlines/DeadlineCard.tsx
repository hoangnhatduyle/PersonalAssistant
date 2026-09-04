import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DEADLINE_STATUS_TONE } from "@/lib/status-colors";
import { DeadlineTransitionMenu } from "@/components/deadlines/DeadlineTransitionMenu";
import { FeedbackControl } from "@/components/feedback/FeedbackControl";
import type { DeadlineRow } from "@/lib/api/entity-types";
import type { SessionProgress } from "@/lib/deadlines/session-progress";

type Props = {
  deadline: DeadlineRow;
  courseName?: string;
  /** Undefined (nothing renders) when this deadline has no sessions. */
  sessionProgress?: SessionProgress;
};

export function DeadlineCard({ deadline, courseName, sessionProgress }: Props) {
  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/deadlines/${deadline.id}`} className="font-display text-base font-medium text-text-primary hover:underline">
            {deadline.title}
          </Link>
          <p className="mt-0.5 font-mono text-xs text-text-secondary">Due {new Date(deadline.due_at).toLocaleString()}</p>
          {courseName && <p className="mt-0.5 text-xs text-text-secondary">{courseName}</p>}
        </div>
        <StatusPill status={deadline.status} tone={DEADLINE_STATUS_TONE[deadline.status]} />
      </div>
      {deadline.priority && <Badge tone="warn">{deadline.priority}</Badge>}
      {sessionProgress && (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-text-secondary">Sessions</span>
            <span className="font-mono text-xs text-text-secondary">
              {sessionProgress.done}/{sessionProgress.total}
            </span>
          </div>
          <ProgressBar value={sessionProgress.ratio} label="Session progress" />
        </div>
      )}
      <DeadlineTransitionMenu deadlineId={deadline.id} status={deadline.status} />
      {deadline.status === "Completed" && <FeedbackControl targetType="deadline" targetId={deadline.id} />}
    </GlassPanel>
  );
}
