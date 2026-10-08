import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import {
  rateLimitedResponse,
  serverErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import { createTriageDeps } from "@/lib/email-triage/deps";
import { runEmailTriage } from "@/lib/email-triage/run-triage";
import { triageListQuerySchema, triageRunPayloadSchema } from "@/lib/email-triage/schemas";
import { loadTriageItems } from "@/lib/email-triage/store";
import type { TriageListResponse, TriageRunResponse } from "@/lib/email-triage/types";

// One batched classification call plus up to 10 body fetches + extractions.
export const maxDuration = 60;

/**
 * POST /api/mail/triage { provider, days? } — a manual triage run for one
 * account (never scheduled). Not-connected and needs-reauth return 200 with
 * flags, like GET /api/mail/messages; the per-user run cap returns 429.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = triageRunPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  const { provider, days } = parsed.data;

  try {
    const outcome = await runEmailTriage(createTriageDeps(supabase, user.id, provider), { provider, days });
    switch (outcome.status) {
      case "not_connected":
        return successResponse<TriageRunResponse>({ connected: false, needsReauth: false, items: [], stats: null });
      case "needs_reauth":
        return successResponse<TriageRunResponse>({ connected: true, needsReauth: true, items: [], stats: null });
      case "rate_limited":
        return rateLimitedResponse("Too many email checks. Try again later.");
      case "ok":
        return successResponse<TriageRunResponse>({
          connected: true,
          needsReauth: false,
          items: outcome.items,
          stats: outcome.stats,
        });
    }
  } catch (error) {
    return serverErrorResponse(`${provider} email triage failed`, error);
  }
}

/**
 * GET /api/mail/triage?provider=&scope=open|all — stored results only (a DB
 * read: no provider or OpenAI calls). `scope=all` includes dismissed/acted
 * items, which the mail card uses for bucket badges.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = triageListQuerySchema.safeParse({
    provider: request.nextUrl.searchParams.get("provider") ?? undefined,
    scope: request.nextUrl.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const items = await loadTriageItems(supabase, user.id, parsed.data);
    return successResponse<TriageListResponse>({ items });
  } catch (error) {
    return serverErrorResponse("mail triage list failed", error);
  }
}
