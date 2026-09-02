"use client";

import { useKnowledgeSourceContent } from "@/hooks/useKnowledge";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { KnowledgeSource } from "@/lib/api/entity-types";

type Props = {
  source: KnowledgeSource;
  open: boolean;
  onClose: () => void;
};

export function ViewKnowledgeSourceDialog({ source, open, onClose }: Props) {
  const { data, isLoading, isError } = useKnowledgeSourceContent(source.id, open);

  return (
    <Dialog open={open} onClose={onClose} title={source.title} size="xl">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs text-text-secondary">
          {source.source_type}
          {source.origin_url ? ` · ${source.origin_url}` : ""}
        </p>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <p className="text-sm text-status-urgent">Could not load this source&apos;s content.</p>
        ) : data?.raw_content ? (
          <p className="whitespace-pre-wrap text-sm text-text-primary">{data.raw_content}</p>
        ) : (
          <p className="text-sm text-text-secondary">
            {source.status === "Ready"
              ? "This source has no extracted text."
              : "Content isn't available yet — it appears once the import finishes."}
          </p>
        )}
      </div>
    </Dialog>
  );
}
