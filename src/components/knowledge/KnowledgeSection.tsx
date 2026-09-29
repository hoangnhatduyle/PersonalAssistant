"use client";

import { useState } from "react";
import { useKnowledgeGraph, useKnowledgeSources } from "@/hooks/useKnowledge";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { KnowledgeImportForm } from "@/components/knowledge/KnowledgeImportForm";
import { KnowledgeGraphView } from "@/components/knowledge/KnowledgeGraphView";
import { KnowledgeSourceCard } from "@/components/knowledge/KnowledgeSourceCard";
import { ViewKnowledgeSourceDialog } from "@/components/knowledge/ViewKnowledgeSourceDialog";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

type ViewMode = "graph" | "list";

export function KnowledgeSection() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // null = the user hasn't chosen: graph on desktop, list on small screens.
  const [storedView, setStoredView] = useLocalStorage<ViewMode | null>("knowledge-view", null);
  const view: ViewMode = storedView ?? (isDesktop ? "graph" : "list");
  const [showSimilar, setShowSimilar] = useLocalStorage<boolean>("knowledge-graph-show-similar", true);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);

  const { data: sourcesData, isLoading: isSourcesLoading } = useKnowledgeSources();
  const { data: graph, isLoading: isGraphLoading } = useKnowledgeGraph();
  const sources = sourcesData?.rows ?? [];

  const isLoading = view === "graph" ? isGraphLoading : isSourcesLoading;
  const isEmpty = view === "graph" ? (graph?.nodes.length ?? 0) === 0 : sources.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <KnowledgeImportForm />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Knowledge view" className="flex gap-2">
          <Button
            size="sm"
            variant={view === "graph" ? "primary" : "secondary"}
            aria-pressed={view === "graph"}
            onClick={() => setStoredView("graph")}
          >
            Graph
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "primary" : "secondary"}
            aria-pressed={view === "list"}
            onClick={() => setStoredView("list")}
          >
            List
          </Button>
        </div>
        {view === "graph" && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showSimilar} onChange={(event) => setShowSimilar(event.target.checked)} />
            Show suggested links
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((n) => (
            <Skeleton key={n} className="h-20 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState title="No knowledge sources yet" description="Import a URL, pasted text, or a file to get started." />
      ) : view === "graph" && graph ? (
        <KnowledgeGraphView graph={graph} showSimilar={showSimilar} onOpenSource={setOpenSourceId} />
      ) : (
        <div className="flex flex-col gap-3">
          {sources.map((source) => (
            <KnowledgeSourceCard key={source.id} source={source} />
          ))}
        </div>
      )}

      {openSourceId && (
        <ViewKnowledgeSourceDialog
          sourceId={openSourceId}
          open
          onClose={() => setOpenSourceId(null)}
          onOpenSource={setOpenSourceId}
        />
      )}
    </div>
  );
}
