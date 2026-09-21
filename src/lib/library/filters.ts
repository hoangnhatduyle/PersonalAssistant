import { ARCHIVED_MODES, LIBRARY_PLATFORMS, type ArchivedMode, type LibraryPlatform } from "@/lib/library/constants";
import { normalizeTags } from "@/lib/library/tags";

export interface LibraryPostFilters {
  q?: string;
  platform?: LibraryPlatform;
  favorite?: boolean;
  archived?: ArchivedMode;
  tags?: string[];
  personId?: string;
  courseId?: string;
  employerId?: string;
  page?: number;
  limit?: number;
}

function positiveInt(value: string | null): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Lenient: unknown/invalid values are dropped rather than throwing (URLs are user-editable). */
export function parseLibraryPostFilters(params: URLSearchParams): LibraryPostFilters {
  const filters: LibraryPostFilters = {};

  const q = params.get("q")?.trim();
  if (q) filters.q = q;

  const platform = params.get("platform");
  if ((LIBRARY_PLATFORMS as readonly string[]).includes(platform ?? "")) filters.platform = platform as LibraryPlatform;

  if (params.get("favorite") === "true") filters.favorite = true;

  const archived = params.get("archived");
  if ((ARCHIVED_MODES as readonly string[]).includes(archived ?? "")) filters.archived = archived as ArchivedMode;

  // `tag` may be repeated and/or comma-joined (toQueryString joins arrays with commas).
  const tags = normalizeTags(params.getAll("tag").flatMap((value) => value.split(",")));
  if (tags.length > 0) filters.tags = tags;

  const personId = params.get("personId");
  if (personId) filters.personId = personId;
  const courseId = params.get("courseId");
  if (courseId) filters.courseId = courseId;
  const employerId = params.get("employerId");
  if (employerId) filters.employerId = employerId;

  const page = positiveInt(params.get("page"));
  if (page && page > 1) filters.page = page;
  const limit = positiveInt(params.get("limit"));
  if (limit) filters.limit = limit;

  return filters;
}

/** Inverse of parseLibraryPostFilters; omits defaults so URLs stay clean. */
export function serializeLibraryPostFilters(filters: LibraryPostFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.favorite) params.set("favorite", "true");
  if (filters.archived && filters.archived !== "exclude") params.set("archived", filters.archived);
  if (filters.tags && filters.tags.length > 0) params.set("tag", filters.tags.join(","));
  if (filters.personId) params.set("personId", filters.personId);
  if (filters.courseId) params.set("courseId", filters.courseId);
  if (filters.employerId) params.set("employerId", filters.employerId);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  return params;
}
