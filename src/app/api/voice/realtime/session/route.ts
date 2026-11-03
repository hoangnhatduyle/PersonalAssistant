import OpenAI from "openai";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { rateLimitedResponse, serverErrorResponse, successResponse } from "@/lib/api/response";
import { requireEnv } from "@/lib/env";
import { loadUserTimezone } from "@/lib/voice/intent";
import { loadCallBudget } from "@/lib/voice/realtime/budget";
import { REALTIME_CLIENT_SECRET_TTL_SECONDS } from "@/lib/voice/realtime/constants";
import { buildSessionConfig, resolveModel } from "@/lib/voice/realtime/session-config";
import { buildCallInstructions } from "@/lib/voice/realtime/session-state";

/**
 * POST /api/voice/realtime/session -- starts a voice call.
 *
 * Checks the day's call budget, builds the model's instructions from the
 * user's own data, asks OpenAI for a short-lived client secret with that whole
 * session baked in, and records the call. The browser connects to OpenAI with
 * the secret; the OpenAI API key never leaves the server, and neither do the
 * instructions or tool list as anything the client can edit.
 *
 * The secret is minted BEFORE the call row is written: if minting fails, no
 * row exists to count against the day for a call that never happened.
 */
export async function POST() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  try {
    const now = new Date();
    const timezone = await loadUserTimezone(supabase, user.id);
    const budget = await loadCallBudget(supabase, user.id, timezone, now);
    if (!budget.allowed) return rateLimitedResponse("You've used today's voice call time. It resets at midnight.");

    // A previous call that never reported its end (app killed) must not stay open.
    await supabase.rpc("close_open_voice_realtime_calls");

    const { instructions } = await buildCallInstructions(supabase, user.id, now);
    const model = resolveModel();
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const secret = await openai.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: REALTIME_CLIENT_SECRET_TTL_SECONDS },
      session: buildSessionConfig({ instructions, model }),
    });

    const { data: call, error } = await supabase.from("voice_realtime_calls").insert({ user_id: user.id }).select("id").single();
    if (error) throw new Error(`call record insert failed: ${error.message}`);

    return successResponse(
      { clientSecret: secret.value, callId: call.id, maxSeconds: budget.maxSeconds, remainingTodaySeconds: budget.remainingSeconds, model },
      { status: 201 },
    );
  } catch (error) {
    return serverErrorResponse("realtime session start failed", error);
  }
}
