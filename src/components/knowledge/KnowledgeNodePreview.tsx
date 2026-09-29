import { StatusPill } from "@/components/ui/StatusPill";
import { KNOWLEDGE_STATUS_TONE } from "@/lib/status-colors";
import type { KnowledgeGraphNode } from "@/lib/api/entity-types";

const PREVIEW_WIDTH_PX = 288;
const POINTER_OFFSET_PX = 14;

type Props = {
  node: KnowledgeGraphNode;
  /** Pointer position relative to the graph container. */
  x: number;
  y: number;
  containerWidth: number;
};

/** Floating hover card for a graph node: title, type/origin, status, and a text snippet. Non-interactive so it never steals the hover. */
export function KnowledgeNodePreview({ node, x, y, containerWidth }: Props) {
  // Flip to the pointer's left side when it would overflow the container's right edge.
  const fitsRight = x + POINTER_OFFSET_PX + PREVIEW_WIDTH_PX <= containerWidth;
  const left = fitsRight ? x + POINTER_OFFSET_PX : Math.max(x - POINTER_OFFSET_PX - PREVIEW_WIDTH_PX, 0);
  const isBusy = node.status === "Pending" || node.status === "Processing";

  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 flex flex-col gap-2 rounded-panel border border-panel-border bg-bg-void-elevated p-3 shadow-panel"
      style={{ left, top: y + POINTER_OFFSET_PX, width: PREVIEW_WIDTH_PX }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-sm font-medium text-text-primary">{node.title}</p>
        <StatusPill status={node.status} tone={KNOWLEDGE_STATUS_TONE[node.status]} pulse={isBusy} />
      </div>
      <p className="truncate font-mono text-xs text-text-secondary">
        {node.source_type}
        {node.origin_url ? ` · ${node.origin_url}` : ""}
      </p>
      {node.snippet ? (
        <p className="line-clamp-5 whitespace-pre-wrap text-xs text-text-primary">{node.snippet}</p>
      ) : (
        <p className="text-xs text-text-secondary">No text extracted yet.</p>
      )}
      <p className="font-mono text-[11px] text-text-secondary">Click to open</p>
    </div>
  );
}
