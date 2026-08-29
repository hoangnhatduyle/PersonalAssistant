import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination } from "@/lib/api/pagination";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";
import type { Database } from "@/lib/supabase/types";

type ReminderStatus = Database["public"]["Enums"]["reminder_status"];
const REMINDER_STATES: readonly ReminderStatus[] = [
  "Scheduled",
  "Delivered",
  "Acknowledged",
  "Dismissed",
  "Snoozed",
  "Expired",
];

function isReminderStatus(value: string): value is ReminderStatus {
  return (REMINDER_STATES as readonly string[]).includes(value);
}

function parseStateFilter(searchParams: URLSearchParams): ReminderStatus[] | null | { error: string } {
  const raw = searchParams.get("state");
  if (!raw) return null;

  const requested = raw.split(",").map((value) => value.trim());
  const invalid = requested.find((value) => !isReminderStatus(value));
  if (invalid) return { error: `Invalid state filter: ${invalid}` };

  return requested.filter(isReminderStatus);
}

/**
 * GET /api/reminders — list, scoped to the caller (NC-API-001). No filter is
 * applied by default: NC-006 requires undelivered reminders (including
 * Snoozed) stay visible/queryable, never silently dropped. `?state=` narrows
 * to specific states when the caller asks for that.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);

  const states = parseStateFilter(searchParams);
  if (states && "error" in states) return validationErrorResponse(states.error);

  let query = supabase
    .from("reminders")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("trigger_at", { ascending: true })
    .range(from, to);
  if (states) query = query.in("acknowledgment_state", states);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("reminders list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}
