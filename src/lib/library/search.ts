/** Split a search box value on whitespace; empty tokens dropped. */
export function tokenizeQuery(query: string): string[] {
  return query.split(/\s+/).filter(Boolean);
}

/** Escape ILIKE wildcards so user input matches literally. */
export function escapeLikeToken(token: string): string {
  return token.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const POST_SEARCH_COLUMNS = ["title", "notes", "url", "author_name"] as const;
const EMPLOYER_SEARCH_COLUMNS = ["name", "notes", "website", "careers_url"] as const;

/**
 * One PostgREST `.or()` filter string per token. Chaining several `.or()`
 * calls ANDs them, so every token must match somewhere (mirrors
 * matchesSearch in src/lib/appointments/list-view.ts). Values are wrapped
 * in double quotes with `"` and `\` escaped so commas/parentheses in user
 * input can't break out of the filter grammar.
 */
function buildSearchOrFilters(query: string, columns: readonly string[]): string[] {
  return tokenizeQuery(query).map((token) => {
    const pattern = `%${escapeLikeToken(token)}%`;
    const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
  });
}

export function buildPostSearchOrFilters(query: string): string[] {
  return buildSearchOrFilters(query, POST_SEARCH_COLUMNS);
}

/** Employers are searched by name, notes and their two URLs (not by role title / tech stack in v1). */
export function buildEmployerSearchOrFilters(query: string): string[] {
  return buildSearchOrFilters(query, EMPLOYER_SEARCH_COLUMNS);
}
