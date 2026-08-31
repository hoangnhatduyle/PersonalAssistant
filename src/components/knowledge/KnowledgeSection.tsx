"use client";

import { useKnowledgeSources } from "@/hooks/useKnowledge";
import { KnowledgeImportForm } from "@/components/knowledge/KnowledgeImportForm";
import { KnowledgeSourceCard } from "@/components/knowledge/KnowledgeSourceCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

export function KnowledgeSection() {
  const { data, isLoading } = useKnowledgeSources();
  const sources = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-6">
      <KnowledgeImportForm />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((n) => (
            <Skeleton key={n} className="h-20 w-full" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState title="No knowledge sources yet" description="Import a URL, pasted text, or a file to get started." />
      ) : (
        <div className="flex flex-col gap-3">
          {sources.map((source) => (
            <KnowledgeSourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
