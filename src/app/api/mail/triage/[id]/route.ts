import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import {
  notFoundResponse,
  serverErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import { triageItemUpdateSchema } from "@/lib/email-triage/schemas";
import { setTriageItemStatus } from "@/lib/email-triage/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/mail/triage/[id] { status: "dismissed" | "acted" } — resolves an
 * open triage item (the user dismissed it, or confirmed a suggested action).
 * Only the status can change; classification and action are written by runs.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return validationErrorResponse("id must be a uuid");

  const parsed = triageItemUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  try {
    const updated = await setTriageItemStatus(supabase, user.id, id, parsed.data.status);
    if (!updated) return notFoundResponse();
    return successResponse({ id, status: parsed.data.status });
  } catch (error) {
    return serverErrorResponse("mail triage item update failed", error);
  }
}
