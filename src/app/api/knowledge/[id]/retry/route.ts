import { after } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, validationErrorResponse, rateLimitedResponse, serverErrorResponse } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processKnowledgeImport } from "@/lib/knowledge/ingestion";
import { checkCreateRateLimit } from "@/lib/knowledge/rate-limit";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/knowledge/[id]/retry — SPEC-API-008 NC-API-016/AC-007. Ownership,
 * Failed-state, and the attempt cap (SPEC-CORE-008 NC-022) are all enforced
 * inside retry_knowledge_import's own CAS predicate (auth.uid() resolves
 * from the caller's JWT even inside a SECURITY DEFINER function) — a
 * `false` return covers every rejection reason uniformly.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  // Architect/security-review finding: retry fans out to exactly the same
  // paid OpenAI Vision/embedding/Deepgram calls as create (NC-API-018's
  // cost-abuse rationale applies verbatim), but had no rate limit at all.
  // Shares the create route's window/cap — a retry is not a materially
  // different cost event than a create.
  let rateLimit: { allowed: boolean };
  try {
    rateLimit = await checkCreateRateLimit(supabase, user.id);
  } catch (error) {
    return serverErrorResponse("rate limit check failed", error);
  }
  if (!rateLimit.allowed) return rateLimitedResponse();

  const { data: retried, error } = await supabase.rpc("retry_knowledge_import", { p_source_id: id });
  if (error) return serverErrorResponse("knowledge source retry failed", error);
  if (!retried) {
    return validationErrorResponse("Source is not retryable: not Failed, not yours, or the attempt cap is exhausted");
  }

  // Critical architect-review finding: retry_knowledge_import already
  // performed the Failed -> Processing transition itself — processKnowledgeImport
  // must NOT also call start_knowledge_import (that CAS only matches
  // Pending and would silently no-op here, stranding the row in Processing
  // until the reaper times it out and burns a retry attempt for nothing).
  after(() => processKnowledgeImport(createServiceRoleClient(), id, { skipStartTransition: true }));

  return successResponse({ id, status: "Processing" as const });
}
