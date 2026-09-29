import { describe, expect, it } from "vitest";
import { canonicalPair, mergeGraphEdges } from "@/lib/knowledge/graph";

describe("canonicalPair", () => {
  it("orders the pair so the smaller id is first regardless of input order", () => {
    expect(canonicalPair("b", "a")).toEqual(["a", "b"]);
    expect(canonicalPair("a", "b")).toEqual(["a", "b"]);
  });
});

describe("mergeGraphEdges", () => {
  const nodeIds = new Set(["a", "b", "c"]);

  it("emits manual and similar edges with their metadata", () => {
    const edges = mergeGraphEdges(nodeIds, [{ id: "l1", source_a: "a", source_b: "b" }], [{ source_a: "b", source_b: "c", similarity: 0.7 }]);
    expect(edges).toEqual([
      { source: "a", target: "b", kind: "manual", linkId: "l1" },
      { source: "b", target: "c", kind: "similar", score: 0.7 },
    ]);
  });

  it("drops the similar edge when the same pair is also manually linked", () => {
    const edges = mergeGraphEdges(nodeIds, [{ id: "l1", source_a: "a", source_b: "b" }], [{ source_a: "a", source_b: "b", similarity: 0.9 }]);
    expect(edges).toEqual([{ source: "a", target: "b", kind: "manual", linkId: "l1" }]);
  });

  it("drops edges with an endpoint that is not a known node", () => {
    const edges = mergeGraphEdges(nodeIds, [{ id: "l1", source_a: "a", source_b: "z" }], [{ source_a: "z", source_b: "c", similarity: 0.8 }]);
    expect(edges).toEqual([]);
  });
});
