const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PaginationParams {
  page: number;
  limit: number;
  /** Inclusive [from, to] range for a Supabase `.range()` call. */
  from: number;
  to: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

/** NC-API-007: list routes exclude soft-deleted rows unless explicitly asked for. */
export function wantsIncludeDeleted(searchParams: URLSearchParams): boolean {
  return searchParams.get("includeDeleted") === "true";
}
