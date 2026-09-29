import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import type { KnowledgeGraph } from "@/lib/api/entity-types";
import {
  KNOWLEDGE_GRAPH_SIMILARITY_THRESHOLD,
  KNOWLEDGE_GRAPH_SNIPPET_CHARS,
  KNOWLEDGE_GRAPH_TOP_K,
} from "@/lib/knowledge/constants";
import { mergeGraphEdges } from "@/lib/knowledge/graph";

/**
 * GET /api/knowledge/graph — nodes (with hover snippets) plus manual links and
 * similarity-suggested edges, scoped to the caller. `?similar=0` omits the
 * suggested edges (and skips the O(n^2) similarity query).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const includeSimilar = request.nextUrl.searchParams.get("similar") !== "0";

  const [nodesResult, linksResult, similarResult] = await Promise.all([
    supabase.rpc("knowledge_graph_nodes", { p_snippet_chars: KNOWLEDGE_GRAPH_SNIPPET_CHARS }),
    supabase.from("knowledge_links").select("id, source_a, source_b").eq("user_id", user.id),
    includeSimilar
      ? supabase.rpc("knowledge_similar_edges", {
          p_threshold: KNOWLEDGE_GRAPH_SIMILARITY_THRESHOLD,
          p_top_k: KNOWLEDGE_GRAPH_TOP_K,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (nodesResult.error) return serverErrorResponse("knowledge graph nodes failed", nodesResult.error);
  if (linksResult.error) return serverErrorResponse("knowledge graph links failed", linksResult.error);
  if (similarResult.error) return serverErrorResponse("knowledge graph similarity failed", similarResult.error);

  const nodes = nodesResult.data ?? [];
  const graph: KnowledgeGraph = {
    nodes,
    edges: mergeGraphEdges(new Set(nodes.map((node) => node.id)), linksResult.data ?? [], similarResult.data ?? []),
  };
  return successResponse(graph);
}
