import type { KnowledgeGraphEdge } from "@/lib/api/entity-types";

export interface ManualLinkRow {
  id: string;
  source_a: string;
  source_b: string;
}

export interface SimilarEdgeRow {
  source_a: string;
  source_b: string;
  similarity: number;
}

/** Links are undirected and stored as (smaller id, larger id); this is the one place that ordering is computed. */
export function canonicalPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

function pairKey(idA: string, idB: string): string {
  const [a, b] = canonicalPair(idA, idB);
  return `${a}|${b}`;
}

/**
 * Merges manual links with similarity suggestions into one edge list. A pair
 * that is both linked and similar is emitted once, as "manual" — the user's
 * explicit link wins. Edges whose endpoints aren't in `nodeIds` are dropped so
 * the client never receives a dangling edge.
 */
export function mergeGraphEdges(
  nodeIds: ReadonlySet<string>,
  manualLinks: readonly ManualLinkRow[],
  similarEdges: readonly SimilarEdgeRow[],
): KnowledgeGraphEdge[] {
  const edges: KnowledgeGraphEdge[] = [];
  const manualKeys = new Set<string>();

  for (const link of manualLinks) {
    if (!nodeIds.has(link.source_a) || !nodeIds.has(link.source_b)) continue;
    manualKeys.add(pairKey(link.source_a, link.source_b));
    edges.push({ source: link.source_a, target: link.source_b, kind: "manual", linkId: link.id });
  }

  for (const edge of similarEdges) {
    if (!nodeIds.has(edge.source_a) || !nodeIds.has(edge.source_b)) continue;
    if (manualKeys.has(pairKey(edge.source_a, edge.source_b))) continue;
    edges.push({ source: edge.source_a, target: edge.source_b, kind: "similar", score: edge.similarity });
  }

  return edges;
}
