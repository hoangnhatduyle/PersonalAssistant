import { describe, expect, it } from "vitest";
import { parseEmployerFilters, serializeEmployerFilters } from "@/lib/library/employer-filters";

const parse = (query: string) => parseEmployerFilters(new URLSearchParams(query));

describe("parseEmployerFilters", () => {
  it("returns an empty object for no params", () => {
    expect(parse("")).toEqual({});
  });

  it("reads q, status, archived, page, limit and view", () => {
    expect(parse("q=acme&status=applied&archived=only&page=3&limit=50&view=board")).toEqual({
      q: "acme",
      status: "applied",
      archived: "only",
      page: 3,
      limit: 50,
      view: "board",
    });
  });

  it("drops unknown or invalid values instead of throwing", () => {
    expect(parse("status=hired&archived=maybe&view=grid&page=-2&limit=abc&q=%20%20")).toEqual({});
  });

  it("treats page 1 as the default", () => {
    expect(parse("page=1")).toEqual({});
  });
});

describe("serializeEmployerFilters", () => {
  it("omits defaults (page 1, archived=exclude, view=list)", () => {
    expect(serializeEmployerFilters({ page: 1, archived: "exclude", view: "list" }).toString()).toBe("");
  });

  it("round-trips", () => {
    const filters = { q: "acme", status: "offer" as const, archived: "all" as const, page: 2, view: "board" as const };
    expect(parseEmployerFilters(serializeEmployerFilters(filters))).toEqual(filters);
  });

  it("can omit the UI-only view param for API calls", () => {
    expect(serializeEmployerFilters({ q: "x", view: "board" }, { includeView: false }).toString()).toBe("q=x");
  });
});
