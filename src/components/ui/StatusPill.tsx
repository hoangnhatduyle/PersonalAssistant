import { Badge } from "@/components/ui/Badge";
import type { StatusTone } from "@/lib/status-colors";

type Props = {
  status: string;
  tone: StatusTone;
  /** Adds a small pulsing dot — used for in-progress/transient states (e.g. Knowledge Pending/Processing). */
  pulse?: boolean;
};

export function StatusPill({ status, tone, pulse = false }: Props) {
  return (
    <Badge tone={tone}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
      {status}
    </Badge>
  );
}
