import { describe, expect, it } from "vitest";
import { normalizeTags, normalizeTechStack } from "@/lib/library/tags";

describe("normalizeTags", () => {
  it("trims, lowercases, collapses whitespace and dedupes", () => {
    expect(normalizeTags(["  React ", "react", "Web   Dev", ""])).toEqual(["react", "web dev"]);
  });

  it("strips commas (they would break the comma-joined tag param)", () => {
    expect(normalizeTags(["a,b"])).toEqual(["a b"]);
  });

  it("caps length at 30 chars", () => {
    expect(normalizeTags(["x".repeat(50)])[0]).toHaveLength(30);
  });

  it("caps count at 20", () => {
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
  });
});

describe("normalizeTechStack", () => {
  it("keeps the first-seen casing, trims, and dedupes case-insensitively", () => {
    expect(normalizeTechStack(["  TypeScript ", "typescript", "AWS", "aws ", "Go"])).toEqual(["TypeScript", "AWS", "Go"]);
  });

  it("drops empties and commas, caps length at 40 chars and count at 30", () => {
    expect(normalizeTechStack(["", "  ", "a,b"])).toEqual(["a b"]);
    expect(normalizeTechStack(["x".repeat(60)])[0]).toHaveLength(40);
    expect(normalizeTechStack(Array.from({ length: 50 }, (_, i) => `t${i}`))).toHaveLength(30);
  });
});
