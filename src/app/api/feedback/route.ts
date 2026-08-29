import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination } from "@/lib/api/pagination";
import { feedbackPayloadSchema } from "@/lib/api/schemas";
import { ownsFeedbackTarget } from "@/lib/api/feedback";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

/** GET /api/feedback — the caller's own feedback history (AC-12; NC-API-001). */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { page, limit, from, to } = parsePagination(request.nextUrl.searchParams);

  const { data, count, error } = await supabase
    .from("feedback")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) return serverErrorResponse("feedback list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/**
 * POST /api/feedback — submit feedback on a Deadline/Task/Reminder instance
 * (AC-11; operationalizes SPEC-CORE-007 AC-004). Pre-checks target ownership
 * so an invalid reference surfaces as a validation error rather than the DB
 * ownership-guard trigger's raw exception text (see lib/api/feedback.ts).
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = feedbackPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const owns = await ownsFeedbackTarget(supabase, user.id, parsed.data.target_type, parsed.data.target_id);
  if (!owns) return validationErrorResponse("target_id must reference a target_type resource you own");

  const { data, error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();
  if (error) return serverErrorResponse("feedback create failed", error);

  return successResponse(data, { status: 201 });
}
