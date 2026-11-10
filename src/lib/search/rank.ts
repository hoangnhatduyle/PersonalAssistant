/**
 * Relevance tiers for command-palette search. Lower is better.
 * Title matches always outrank body-only matches.
 */
export const MATCH_TIER = {
  exact: 0,
  prefix: 1,
  wordPrefix: 2,
  substring: 3,
  body: 4,
} as const;

export type MatchTier = (typeof MATCH_TIER)[keyof typeof MATCH_TIER];

/** Escape LIKE/ILIKE wildcards and PostgREST filter delimiters so user input is matched literally. */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ");
}

export function matchTier(query: string, title: string, bodyFields: ReadonlyArray<string | null | undefined> = []): MatchTier | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const t = title.toLowerCase();
  if (t === q) return MATCH_TIER.exact;
  if (t.startsWith(q)) return MATCH_TIER.prefix;
  if (t.split(/[\s\-—_/.,:()]+/).some((word) => word.startsWith(q))) return MATCH_TIER.wordPrefix;
  if (t.includes(q)) return MATCH_TIER.substring;
  if (bodyFields.some((field) => field?.toLowerCase().includes(q))) return MATCH_TIER.body;
  return null;
}

/** Stable sort by tier, keeping the caller's order within a tier. */
export function rankByTier<T extends { tier: MatchTier }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.tier - b.item.tier || a.index - b.index)
    .map(({ item }) => item);
}
