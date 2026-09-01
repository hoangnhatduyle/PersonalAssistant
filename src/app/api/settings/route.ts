import { requireAuthenticatedContext } from "@/lib/api/auth";
import { userPreferencesPatchSchema } from "@/lib/api/schemas";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/lib/api/entity-types";

const USER_PREFERENCES_PUBLIC_COLUMNS =
  "default_reminder_lead_minutes, quiet_hours_start, quiet_hours_end, timezone, voice_capture_enabled, email_reminders_enabled, updated_at";

/** GET /api/settings — SPEC-API-009 AC-1: column defaults (updated_at: null) when no row has ever been saved; never creates one. */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from("user_preferences")
    .select(USER_PREFERENCES_PUBLIC_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return serverErrorResponse("settings get failed", error);

  return successResponse<UserPreferences>(data ?? DEFAULT_USER_PREFERENCES);
}

/**
 * PATCH /api/settings — SPEC-API-009 AC-2: upserts the caller's single row
 * by user_id, creating it on first save. Only the fields present in the
 * validated payload are written; PostgREST's upsert only sets the columns
 * actually passed, so anything omitted keeps its current value on update,
 * or its column DEFAULT on the first insert.
 */
export async function PATCH(request: Request) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = userPreferencesPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return validationErrorResponse("No valid fields to update");

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" })
    .select(USER_PREFERENCES_PUBLIC_COLUMNS)
    .single();
  if (error) return serverErrorResponse("settings update failed", error);

  return successResponse<UserPreferences>(data);
}
