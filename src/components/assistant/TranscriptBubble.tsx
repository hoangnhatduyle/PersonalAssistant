type Props = {
  status: "listening" | "transcribing";
};

const LABEL: Record<Props["status"], string> = {
  listening: "Listening…",
  transcribing: "Transcribing…",
};

export function TranscriptBubble({ status }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-panel-border bg-bg-void-elevated px-3 py-2 text-xs text-text-secondary">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-teal" aria-hidden="true" />
      {LABEL[status]}
    </div>
  );
}
