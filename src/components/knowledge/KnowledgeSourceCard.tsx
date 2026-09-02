"use client";

import { useState } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DeleteKnowledgeSourceButton } from "@/components/knowledge/DeleteKnowledgeSourceButton";
import { ViewKnowledgeSourceDialog } from "@/components/knowledge/ViewKnowledgeSourceDialog";
import { EditKnowledgeSourceDialog } from "@/components/knowledge/EditKnowledgeSourceDialog";
import { useRetryKnowledgeSource } from "@/hooks/useKnowledge";
import { useToast } from "@/components/ui/Toast";
import { KNOWLEDGE_STATUS_TONE } from "@/lib/status-colors";
import type { KnowledgeSource } from "@/lib/api/entity-types";

// Editing an image/video/audio source would need re-uploading the original
// bytes (never retained client-side) — only text-backed sources can be
// edited in place (as create-replacement + delete-original; see
// EditKnowledgeSourceDialog).
const EDITABLE_SOURCE_TYPES = new Set<KnowledgeSource["source_type"]>(["pasted_text", "url"]);

// SPEC-CORE-008 NC-022: the retry attempt cap is enforced only inside
// 0007_knowledge_base.sql's CAS predicate ("and attempt_count < 3") — no
// exported TS constant exists for it. Hardcoded here for a UX-only "hide
// the Retry button past the cap" check; the server remains the real
// enforcer regardless of what this renders.
const KNOWLEDGE_MAX_RETRY_ATTEMPTS = 3;

type Props = {
  source: KnowledgeSource;
};

export function KnowledgeSourceCard({ source }: Props) {
  const retry = useRetryKnowledgeSource(source.id);
  const { showToast } = useToast();
  const [isViewOpen, setViewOpen] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);

  const handleRetry = async () => {
    try {
      await retry.mutateAsync();
      showToast("Retry started", "success");
    } catch {
      showToast("Could not retry the import", "error");
    }
  };

  const isPulsing = source.status === "Pending" || source.status === "Processing";

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-medium text-text-primary">{source.title}</p>
          <p className="mt-0.5 font-mono text-xs text-text-secondary">
            {source.source_type}
            {source.origin_url ? ` · ${source.origin_url}` : ""}
          </p>
        </div>
        <StatusPill status={source.status} tone={KNOWLEDGE_STATUS_TONE[source.status]} pulse={isPulsing} />
      </div>

      {source.status === "Failed" && (
        <div className="flex flex-wrap items-center gap-2">
          {source.error_message && <p className="w-full text-sm text-status-urgent">{source.error_message}</p>}
          <Badge tone="neutral">
            {source.attempt_count} / {KNOWLEDGE_MAX_RETRY_ATTEMPTS} attempts
          </Badge>
          {source.attempt_count < KNOWLEDGE_MAX_RETRY_ATTEMPTS && (
            <Button size="sm" variant="secondary" onClick={handleRetry} isLoading={retry.isPending}>
              Retry
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setViewOpen(true)}>
          View
        </Button>
        {EDITABLE_SOURCE_TYPES.has(source.source_type) && (
          <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        )}
        <DeleteKnowledgeSourceButton sourceId={source.id} />
      </div>

      <ViewKnowledgeSourceDialog source={source} open={isViewOpen} onClose={() => setViewOpen(false)} />
      {EDITABLE_SOURCE_TYPES.has(source.source_type) && (
        <EditKnowledgeSourceDialog source={source} open={isEditOpen} onClose={() => setEditOpen(false)} />
      )}
    </GlassPanel>
  );
}
