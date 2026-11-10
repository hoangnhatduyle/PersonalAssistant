import { describe, expect, it } from "vitest";
import { escapeLikePattern, matchTier, MATCH_TIER, rankByTier } from "../rank";

describe("matchTier", () => {
  it("ranks exact > prefix > word-prefix > substring > body", () => {
    expect(matchTier("essay", "Essay")).toBe(MATCH_TIER.exact);
    expect(matchTier("ess", "Essay draft")).toBe(MATCH_TIER.prefix);
    expect(matchTier("draft", "Essay draft")).toBe(MATCH_TIER.wordPrefix);
    expect(matchTier("say", "Essay draft")).toBe(MATCH_TIER.substring);
    expect(matchTier("library", "Study", ["Room in the Library"])).toBe(MATCH_TIER.body);
  });

  it("returns null when nothing matches or the query is blank", () => {
    expect(matchTier("zzz", "Essay", ["notes"])).toBeNull();
    expect(matchTier("  ", "Essay")).toBeNull();
  });
});

describe("rankByTier", () => {
  it("is stable within a tier", () => {
    const out = rankByTier([
      { id: "a", tier: MATCH_TIER.substring },
      { id: "b", tier: MATCH_TIER.prefix },
      { id: "c", tier: MATCH_TIER.substring },
    ]);
    expect(out.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("escapeLikePattern", () => {
  it("escapes wildcards and strips filter delimiters", () => {
    expect(escapeLikePattern("50%_off")).toBe("50\\%\\_off");
    expect(escapeLikePattern("a,b(c)")).toBe("a b c ");
  });
});
