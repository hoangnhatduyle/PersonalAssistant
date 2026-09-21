import { describe, expect, it } from "vitest";
import { buildEmployerSearchOrFilters, buildPostSearchOrFilters, escapeLikeToken, tokenizeQuery } from "@/lib/library/search";

describe("tokenizeQuery", () => {
  it("splits on whitespace and drops empties", () => {
    expect(tokenizeQuery("  react   hooks ")).toEqual(["react", "hooks"]);
    expect(tokenizeQuery("   ")).toEqual([]);
  });
});

describe("escapeLikeToken", () => {
  it("escapes %, _ and backslash", () => {
    expect(escapeLikeToken("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});

describe("buildPostSearchOrFilters", () => {
  it("returns one OR group per token over all four columns", () => {
    const groups = buildPostSearchOrFilters("react hooks");
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group).toContain("title.ilike.");
      expect(group).toContain("notes.ilike.");
      expect(group).toContain("url.ilike.");
      expect(group).toContain("author_name.ilike.");
    }
  });

  it("quotes values so commas and parentheses cannot break the grammar", () => {
    const [group] = buildPostSearchOrFilters("100%,");
    // %,  -> LIKE-escaped to \%, then backslash doubled for PostgREST quoting
    expect(group.split(",").length).toBeGreaterThan(4); // the literal comma lives inside the quotes
    expect(group).toContain('title.ilike."%100\\\\%,%"');
  });

  it("escapes embedded double quotes", () => {
    expect(buildPostSearchOrFilters('"hi"')[0]).toContain('title.ilike."%\\"hi\\"%"');
  });

  it("returns no groups for an empty query", () => {
    expect(buildPostSearchOrFilters("  ")).toEqual([]);
  });
});

describe("buildEmployerSearchOrFilters", () => {
  it("searches name, notes, website and careers_url — one AND group per token", () => {
    const groups = buildEmployerSearchOrFilters("acme corp");
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      for (const column of ["name", "notes", "website", "careers_url"]) expect(group).toContain(`${column}.ilike.`);
      expect(group).not.toContain("title.ilike.");
    }
  });

  it("escapes wildcards and quotes like the post search", () => {
    const [group] = buildEmployerSearchOrFilters('50%,"x"');
    expect(group).toContain("\\%");
    expect(group).toContain('\\"x\\"');
  });

  it("is empty for a blank query", () => {
    expect(buildEmployerSearchOrFilters("  ")).toEqual([]);
  });
});
