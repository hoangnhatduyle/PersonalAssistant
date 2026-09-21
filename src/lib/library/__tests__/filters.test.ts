import { describe, expect, it } from "vitest";
import { parseLibraryPostFilters, serializeLibraryPostFilters } from "@/lib/library/filters";

describe("parseLibraryPostFilters", () => {
  it("parses every supported param", () => {
    const filters = parseLibraryPostFilters(
      new URLSearchParams("q=react&platform=instagram&favorite=true&archived=only&tag=A,b&tag=c&personId=p1&courseId=c1&page=3&limit=50"),
    );
    expect(filters).toEqual({
      q: "react",
      platform: "instagram",
      favorite: true,
      archived: "only",
      tags: ["a", "b", "c"],
      personId: "p1",
      courseId: "c1",
      page: 3,
      limit: 50,
    });
  });

  it("drops invalid values instead of throwing", () => {
    expect(parseLibraryPostFilters(new URLSearchParams("platform=myspace&archived=maybe&page=-2&limit=abc&favorite=no&q=%20"))).toEqual({});
  });

  it("treats page 1 as the default", () => {
    expect(parseLibraryPostFilters(new URLSearchParams("page=1"))).toEqual({});
  });
});

describe("serializeLibraryPostFilters", () => {
  it("omits defaults", () => {
    expect(serializeLibraryPostFilters({ archived: "exclude", page: 1 }).toString()).toBe("");
  });

  it("round-trips", () => {
    const filters = { q: "a b", platform: "facebook" as const, favorite: true, archived: "all" as const, tags: ["x", "y"], page: 2 };
    expect(parseLibraryPostFilters(serializeLibraryPostFilters(filters))).toEqual(filters);
  });
});

describe("employerId filter", () => {
  it("parses and round-trips employerId", () => {
    const filters = parseLibraryPostFilters(new URLSearchParams("employerId=e1&page=2"));
    expect(filters).toEqual({ employerId: "e1", page: 2 });
    expect(serializeLibraryPostFilters(filters).toString()).toBe("employerId=e1&page=2");
  });
});
