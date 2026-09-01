import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination } from "@/lib/api/pagination";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";
import type { Database } from "@/lib/supabase/types";

type PersonalizationSuggestionStatus = Database["public"]["Enums"]["personalization_suggestion_status"];
const SUGGESTION_STATUSES: readonly PersonalizationSuggestionStatus[] = ["pending", "applied", "dismissed"];

function isSuggestionStatus(value: string): value is PersonalizationSuggestionStatus {
  return (SUGGESTION_STATUSES as readonly string[]).includes(value);
}

function parseStatusFilter(searchParams: URLSearchParams): PersonalizationSuggestionStatus[] | null | { error: string } {
  const raw = searchParams.get("status");
  if (!raw) return null;

  const requested = raw.split(",").map((value) => value.trim());
  const invalid = requested.find((value) => !isSuggestionStatus(value));
  if (invalid) return { error: `Invalid status filter: ${invalid}` };

  return requested.filter(isSuggestionStatus);
}

/** GET /api/suggestions — list, scoped to the caller. No filter returns every status; `?status=` narrows (e.g. `pending` for the dashboard panel). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);

  const statuses = parseStatusFilter(searchParams);
  if (statuses && "error" in statuses) return validationErrorResponse(statuses.error);

  let query = supabase
    .from("personalization_suggestions")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (statuses) query = query.in("status", statuses);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("suggestions list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}
