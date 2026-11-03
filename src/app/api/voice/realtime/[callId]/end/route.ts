import { requireAuthenticatedContext } from "@/lib/api/auth";
import { serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { endRequestSchema } from "@/lib/voice/realtime/schemas";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ callId: string }>;
}

/**
 * POST /api/voice/realtime/[callId]/end -- records the end of a call.
 *
 * The recorded end time is the SERVER's clock, capped at the call limit, by
 * end_voice_realtime_call (0058): the client only says that the call is over
 * and why, so it can neither lengthen nor shorten what the call counts as.
 *
 * Also the target of navigator.sendBeacon when the page is hidden or closed,
 * which posts a string body with a text/plain content type -- so the body is
 * read as text and parsed here rather than trusted to be application/json, and
 * a missing or unreadable body just means the default reason.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase } = ctx;

  const { callId } = await params;
  if (!z.uuid().safeParse(callId).success) return validationErrorResponse("Invalid call id");

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    body = {};
  }
  const parsed = endRequestSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data, error } = await supabase.rpc("end_voice_realtime_call", { p_call_id: callId, p_reason: parsed.data.reason });
  if (error) return serverErrorResponse("realtime call end failed", error);

  // null means there was nothing open to end (already ended, unknown, or not theirs): a repeat is harmless.
  return successResponse({ ended: data !== null });
}
