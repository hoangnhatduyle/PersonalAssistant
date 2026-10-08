import { Badge } from "@/components/ui/Badge";
import type { StatusTone } from "@/lib/status-colors";
import type { TriageBucket } from "@/lib/email-triage/types";

const BUCKET_DISPLAY: Record<TriageBucket, { label: string; tone: StatusTone }> = {
  needs_action: { label: "Needs action", tone: "warn" },
  important: { label: "Important", tone: "accent" },
  fyi: { label: "FYI", tone: "neutral" },
  ignore: { label: "Ignore", tone: "neutral" },
};

export function bucketLabel(bucket: TriageBucket): string {
  return BUCKET_DISPLAY[bucket].label;
}

/** A triage bucket as a small pill, shared by the "Needs your attention" card and the mail card's rows. */
export function TriageBucketBadge({ bucket, className = "" }: { bucket: TriageBucket; className?: string }) {
  const { label, tone } = BUCKET_DISPLAY[bucket];
  return (
    <Badge tone={tone} className={`px-2 py-0 text-[10px] ${className}`}>
      {label}
    </Badge>
  );
}
