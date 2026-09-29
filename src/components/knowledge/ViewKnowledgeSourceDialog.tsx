"use client";

import { useState } from "react";
import {
  useCreateKnowledgeLink,
  useDeleteKnowledgeLink,
  useKnowledgeGraph,
  useKnowledgeSource,
  useKnowledgeSourceContent,
  useRetryKnowledgeSource,
} from "@/hooks/useKnowledge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { DeleteKnowledgeSourceButton } from "@/components/knowledge/DeleteKnowledgeSourceButton";
import { EditKnowledgeSourceDialog } from "@/components/knowledge/EditKnowledgeSourceDialog";
import { KNOWLEDGE_STATUS_TONE } from "@/lib/status-colors";
import type { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeSource } from "@/lib/api/entity-types";

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
  sourceId: string;
  open: boolean;
  onClose: () => void;
  /** Lets a caller (the graph) jump to a linked source's own dialog. */
  onOpenSource?: (sourceId: string) => void;
};

/** Full view of one knowledge source: content, retry/edit/delete, and its manual + suggested links. */
export function ViewKnowledgeSourceDialog({ sourceId, open, onClose, onOpenSource }: Props) {
  const { data: source } = useKnowledgeSource(open ? sourceId : "");
  const { data: content, isLoading, isError } = useKnowledgeSourceContent(sourceId, open);
  const [isEditOpen, setEditOpen] = useState(false);

  return (
    <>
      <Dialog open={open && !isEditOpen} onClose={onClose} title={source?.title ?? "Knowledge source"} size="xl">
        <div className="flex flex-col gap-5">
          {source && (
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs text-text-secondary">
                {source.source_type}
                {source.origin_url ? ` · ${source.origin_url}` : ""}
              </p>
              <StatusPill
                status={source.status}
                tone={KNOWLEDGE_STATUS_TONE[source.status]}
                pulse={source.status === "Pending" || source.status === "Processing"}
              />
            </div>
          )}

          {source?.status === "Failed" && <FailedBanner source={source} />}

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : isError ? (
            <p className="text-sm text-status-urgent">Could not load this source&apos;s content.</p>
          ) : content?.raw_content ? (
            <p className="whitespace-pre-wrap text-sm text-text-primary">{content.raw_content}</p>
          ) : (
            <p className="text-sm text-text-secondary">
              {source?.status === "Ready"
                ? "This source has no extracted text."
                : "Content isn't available yet — it appears once the import finishes."}
            </p>
          )}

          <LinkedSources sourceId={sourceId} onOpenSource={onOpenSource} />

          {source && (
            <div className="flex justify-end gap-2">
              {EDITABLE_SOURCE_TYPES.has(source.source_type) && (
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              )}
              <DeleteKnowledgeSourceButton sourceId={source.id} onDeleted={onClose} />
            </div>
          )}
        </div>
      </Dialog>

      {source && EDITABLE_SOURCE_TYPES.has(source.source_type) && (
        <EditKnowledgeSourceDialog
          source={source}
          open={open && isEditOpen}
          onClose={() => {
            setEditOpen(false);
            // Saving replaces the source (new id), so this dialog's id is gone.
            onClose();
          }}
        />
      )}
    </>
  );
}

function FailedBanner({ source }: { source: KnowledgeSource }) {
  const retry = useRetryKnowledgeSource(source.id);
  const { showToast } = useToast();

  const handleRetry = async () => {
    try {
      await retry.mutateAsync();
      showToast("Retry started", "success");
    } catch {
      showToast("Could not retry the import", "error");
    }
  };

  return (
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
  );
}

function otherEnd(edge: KnowledgeGraphEdge, sourceId: string): string {
  return edge.source === sourceId ? edge.target : edge.source;
}

function LinkedSources({ sourceId, onOpenSource }: { sourceId: string; onOpenSource?: (id: string) => void }) {
  const { data: graph } = useKnowledgeGraph();
  const createLink = useCreateKnowledgeLink();
  const deleteLink = useDeleteKnowledgeLink();
  const { showToast } = useToast();
  const [pickerValue, setPickerValue] = useState("");

  if (!graph) return <Skeleton className="h-16 w-full" />;

  const nodesById = new Map<string, KnowledgeGraphNode>(graph.nodes.map((node) => [node.id, node]));
  const touching = graph.edges.filter((edge) => edge.source === sourceId || edge.target === sourceId);
  const manual = touching.filter((edge) => edge.kind === "manual");
  const suggested = touching.filter((edge) => edge.kind === "similar");
  const linkedIds = new Set(manual.map((edge) => otherEnd(edge, sourceId)));
  const candidates = graph.nodes.filter((node) => node.id !== sourceId && !linkedIds.has(node.id));

  const link = async (targetId: string) => {
    try {
      await createLink.mutateAsync({ source_id: sourceId, target_id: targetId });
      setPickerValue("");
    } catch {
      showToast("Could not link the sources", "error");
    }
  };

  const unlink = async (linkId: string) => {
    try {
      await deleteLink.mutateAsync(linkId);
    } catch {
      showToast("Could not remove the link", "error");
    }
  };

  const renderTitle = (id: string) => {
    const title = nodesById.get(id)?.title ?? "Untitled source";
    return onOpenSource ? (
      <button type="button" className="text-left hover:underline" onClick={() => onOpenSource(id)}>
        {title}
      </button>
    ) : (
      <span>{title}</span>
    );
  };

  return (
    <section aria-labelledby="linked-sources-heading" className="flex flex-col gap-3 border-t border-panel-border pt-4">
      <h3 id="linked-sources-heading" className="font-display text-sm font-semibold text-text-primary">
        Linked sources
      </h3>

      {manual.length === 0 ? (
        <p className="text-sm text-text-secondary">No manual links yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {manual.map((edge) => (
            <li
              key={edge.linkId}
              className="flex items-center gap-1.5 rounded-full border border-accent-indigo/40 bg-accent-indigo/10 py-1 pl-3 pr-1 text-sm text-text-primary"
            >
              {renderTitle(otherEnd(edge, sourceId))}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove link to ${nodesById.get(otherEnd(edge, sourceId))?.title ?? "source"}`}
                onClick={() => edge.linkId && unlink(edge.linkId)}
                disabled={deleteLink.isPending}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Select
          aria-label="Link to another source"
          value={pickerValue}
          onChange={(event) => setPickerValue(event.target.value)}
          disabled={candidates.length === 0 || createLink.isPending}
        >
          <option value="">{candidates.length === 0 ? "No other sources to link" : "Link to another source…"}</option>
          {candidates.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          aria-label="Add link"
          onClick={() => pickerValue && link(pickerValue)}
          disabled={!pickerValue}
          isLoading={createLink.isPending}
        >
          Link
        </Button>
      </div>

      {suggested.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">Suggested (similar content)</p>
          <ul className="flex flex-col gap-1.5">
            {suggested.map((edge) => {
              const otherId = otherEnd(edge, sourceId);
              return (
                <li key={otherId} className="flex items-center justify-between gap-2 text-sm text-text-primary">
                  {renderTitle(otherId)}
                  <span className="flex items-center gap-2">
                    {edge.score !== undefined && (
                      <span className="font-mono text-xs text-text-secondary">{Math.round(edge.score * 100)}%</span>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Link ${nodesById.get(otherId)?.title ?? "source"}`}
                      onClick={() => link(otherId)}
                      disabled={createLink.isPending}
                    >
                      Link
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
