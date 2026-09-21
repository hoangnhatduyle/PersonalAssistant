import { ARCHIVED_MODES, EMPLOYER_VIEWS, type ArchivedMode, type EmployerView } from "@/lib/library/constants";
import { isApplicationStatus, type ApplicationStatus } from "@/lib/library/application-status";

export interface LibraryEmployerFilters {
  q?: string;
  status?: ApplicationStatus;
  archived?: ArchivedMode;
  page?: number;
  limit?: number;
  /** UI-only: list vs pipeline board. Never sent to the API. */
  view?: EmployerView;
}

function positiveInt(value: string | null): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Lenient: unknown/invalid values are dropped rather than throwing (URLs are user-editable). */
export function parseEmployerFilters(params: URLSearchParams): LibraryEmployerFilters {
  const filters: LibraryEmployerFilters = {};

  const q = params.get("q")?.trim();
  if (q) filters.q = q;

  const status = params.get("status");
  if (isApplicationStatus(status)) filters.status = status;

  const archived = params.get("archived");
  if ((ARCHIVED_MODES as readonly string[]).includes(archived ?? "")) filters.archived = archived as ArchivedMode;

  const page = positiveInt(params.get("page"));
  if (page && page > 1) filters.page = page;
  const limit = positiveInt(params.get("limit"));
  if (limit) filters.limit = limit;

  const view = params.get("view");
  if ((EMPLOYER_VIEWS as readonly string[]).includes(view ?? "")) filters.view = view as EmployerView;

  return filters;
}

/** Inverse of parseEmployerFilters; omits defaults so URLs stay clean. */
export function serializeEmployerFilters(filters: LibraryEmployerFilters, options: { includeView?: boolean } = {}): URLSearchParams {
  const { includeView = true } = options;
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.archived && filters.archived !== "exclude") params.set("archived", filters.archived);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (includeView && filters.view && filters.view !== "list") params.set("view", filters.view);
  return params;
}
