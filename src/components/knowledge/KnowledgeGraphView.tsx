"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { KnowledgeNodePreview } from "@/components/knowledge/KnowledgeNodePreview";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { KnowledgeGraph, KnowledgeGraphNode } from "@/lib/api/entity-types";

// The force-graph canvas reads window/devicePixelRatio at import time, so it
// must never render on the server.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const GRAPH_HEIGHT_PX = 480;
const NODE_BASE_RADIUS = 4;
const LABEL_MIN_ZOOM = 1.4;

type GraphNode = KnowledgeGraphNode & { degree: number; x?: number; y?: number };
type GraphLink = { source: string; target: string; kind: "manual" | "similar" };

// force-graph types its accessors with a generic LinkObject, not our GraphLink.
const isManualLink = (link: object): boolean => (link as GraphLink).kind === "manual";

type Palette = { ready: string; busy: string; failed: string; manual: string; similar: string; label: string };
const FALLBACK_PALETTE: Palette = {
  ready: "#6366f1",
  busy: "#f59e0b",
  failed: "#ef4444",
  manual: "#818cf8",
  similar: "rgba(148, 163, 184, 0.35)",
  label: "#cbd5e1",
};

/** Canvas can't use Tailwind classes, so read the theme's CSS variables once on mount (falls back to fixed colors). */
function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    ready: read("--accent-indigo", FALLBACK_PALETTE.ready),
    busy: read("--status-warn", FALLBACK_PALETTE.busy),
    failed: read("--status-urgent", FALLBACK_PALETTE.failed),
    manual: read("--accent-indigo", FALLBACK_PALETTE.manual),
    similar: FALLBACK_PALETTE.similar,
    label: read("--text-secondary", FALLBACK_PALETTE.label),
  };
}

type Props = {
  graph: KnowledgeGraph;
  showSimilar: boolean;
  onOpenSource: (sourceId: string) => void;
};

/**
 * Obsidian-style force graph of knowledge sources. Hover previews a node
 * (snippet card); click opens the full dialog. Touch devices have no hover,
 * so there the first tap previews and a second tap on the same node opens it.
 */
export function KnowledgeGraphView({ graph, showSimilar, onOpenSource }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [palette, setPalette] = useState<Palette>(FALLBACK_PALETTE);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const isTouch = useMediaQuery("(hover: none)");

  useEffect(() => {
    // Reading computed CSS variables is an external-system sync that can only
    // happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPalette(readPalette());
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // force-graph mutates the node/link objects it is given (positions, resolved
  // link endpoints), so hand it fresh copies; react-query's structural sharing
  // keeps `graph` referentially stable while the data is unchanged, so the
  // layout doesn't reset on every background refetch.
  const graphData = useMemo(() => {
    const links: GraphLink[] = graph.edges
      .filter((edge) => showSimilar || edge.kind === "manual")
      .map((edge) => ({ source: edge.source, target: edge.target, kind: edge.kind }));
    const degree = new Map<string, number>();
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }
    const nodes: GraphNode[] = graph.nodes.map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 }));
    return { nodes, links };
  }, [graph, showSimilar]);

  const nodeColor = (node: GraphNode): string =>
    node.status === "Failed" ? palette.failed : node.status === "Ready" ? palette.ready : palette.busy;
  const nodeRadius = (node: GraphNode): number => NODE_BASE_RADIUS + Math.sqrt(node.degree) * 2;

  const previewNode = isTouch ? (graph.nodes.find((node) => node.id === pinnedId) ?? null) : hovered;

  const trackPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-panel border border-panel-border bg-bg-void-elevated"
      style={{ height: GRAPH_HEIGHT_PX }}
      onPointerMove={trackPointer}
      onPointerDown={trackPointer}
    >
      {width > 0 && (
        <ForceGraph2D
          width={width}
          height={GRAPH_HEIGHT_PX}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTicks={120}
          nodeRelSize={NODE_BASE_RADIUS}
          nodeLabel={() => ""}
          linkColor={(link) => (isManualLink(link) ? palette.manual : palette.similar)}
          linkWidth={(link) => (isManualLink(link) ? 2 : 1)}
          linkLineDash={(link) => (isManualLink(link) ? null : [3, 3])}
          nodeCanvasObject={(rawNode, context, globalScale) => {
            const node = rawNode as GraphNode;
            const radius = nodeRadius(node);
            const isActive = previewNode?.id === node.id;
            context.beginPath();
            context.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
            context.fillStyle = nodeColor(node);
            context.globalAlpha = isActive || !previewNode ? 1 : 0.55;
            context.fill();
            if (isActive) {
              context.lineWidth = 2 / globalScale;
              context.strokeStyle = palette.label;
              context.stroke();
            }
            context.globalAlpha = 1;
            if (isActive || globalScale >= LABEL_MIN_ZOOM) {
              const fontSize = 12 / globalScale;
              context.font = `${fontSize}px sans-serif`;
              context.textAlign = "center";
              context.textBaseline = "top";
              context.fillStyle = palette.label;
              context.fillText(node.title, node.x ?? 0, (node.y ?? 0) + radius + 2 / globalScale);
            }
          }}
          nodePointerAreaPaint={(rawNode, color, context) => {
            const node = rawNode as GraphNode;
            context.fillStyle = color;
            context.beginPath();
            // Slightly generous hit area so small nodes are easy to hover/tap.
            context.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 3, 0, 2 * Math.PI);
            context.fill();
          }}
          onNodeHover={(node) => setHovered((node as GraphNode | null) ?? null)}
          onNodeClick={(rawNode) => {
            const node = rawNode as GraphNode;
            if (isTouch && pinnedId !== node.id) {
              setPinnedId(node.id);
              return;
            }
            setPinnedId(null);
            onOpenSource(node.id);
          }}
          onBackgroundClick={() => setPinnedId(null)}
        />
      )}

      {previewNode && <KnowledgeNodePreview node={previewNode} x={pointer.x} y={pointer.y} containerWidth={width} />}

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-text-secondary">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-5 bg-accent-indigo" aria-hidden="true" /> Linked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-5 border-t border-dashed border-text-secondary" aria-hidden="true" /> Suggested
      </span>
    </div>
  );
}
