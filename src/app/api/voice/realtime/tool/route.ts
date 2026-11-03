import { requireAuthenticatedContext } from "@/lib/api/auth";
import { conflictResponse, serverErrorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { REALTIME_MAX_CALL_SECONDS } from "@/lib/voice/realtime/constants";
import { toolRequestSchema } from "@/lib/voice/realtime/schemas";
import { createCallToolPorts, executeCallTool } from "@/lib/voice/realtime/tool-executor";

// A knowledge lookup or an email triage inside a call can take several seconds.
export const maxDuration = 60;

// A tool call that arrives just after the cap (network lag) is still honoured.
const CALL_GRACE_SECONDS = 15;

/**
 * POST /api/voice/realtime/tool -- runs one tool call the model made during a
 * voice call and returns what it should read next.
 *
 * Runs as the signed-in user with their own RLS-scoped client, never a
 * service-role one: the browser relaying a model's tool call is no more
 * trustworthy than the browser itself, so every tool must be safe for this
 * user to invoke directly -- and each one re-checks the ids it is given
 * against what this user owns. The call has to be one of theirs, still open,
 * and within the time limit.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = toolRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  const { callId, name, arguments: args, lastUserTranscript, batch } = parsed.data;

  const started = Date.now();
  try {
    const { data: call, error } = await supabase.from("voice_realtime_calls").select("started_at, ended_at").eq("id", callId).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!call) return validationErrorResponse("Unknown call");
    if (call.ended_at) return conflictResponse("This call has ended");
    if (Date.now() > new Date(call.started_at).getTime() + (REALTIME_MAX_CALL_SECONDS + CALL_GRACE_SECONDS) * 1000) {
      return conflictResponse("This call has passed its time limit");
    }

    const result = await executeCallTool(createCallToolPorts(supabase, user.id), { name, arguments: args, lastUserTranscript, batch });
    const response = successResponse(result);
    // Lets the on-device diagnostics (and the eval) see how long a tool really takes.
    response.headers.set("Server-Timing", `tool;dur=${Date.now() - started}`);
    return response;
  } catch (error) {
    return serverErrorResponse("realtime tool call failed", error);
  }
}
