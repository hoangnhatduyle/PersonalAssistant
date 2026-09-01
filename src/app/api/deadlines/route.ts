import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { parsePagination, wantsIncludeDeleted } from "@/lib/api/pagination";
import { deadlinePayloadSchema } from "@/lib/api/schemas";
import { syncReminderForTarget } from "@/lib/api/reminders";
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

/**
 * GET /api/deadlines — list, scoped to the caller (NC-API-001/AC-4,
 * NC-API-007). `personId` filters to one tracked Person's deadlines ("me"
 * for the account owner's own, unfiltered when omitted — People feature).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const { searchParams } = request.nextUrl;
  const { page, limit, from, to } = parsePagination(searchParams);
  const includeDeleted = wantsIncludeDeleted(searchParams);

  let query = supabase
    .from("deadlines")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("due_at", { ascending: true })
    .range(from, to);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const courseId = searchParams.get("courseId");
  if (courseId) query = query.eq("course_id", courseId);

  const personId = searchParams.get("personId");
  if (personId === "me") query = query.is("person_id", null);
  else if (personId) query = query.eq("person_id", personId);

  const { data, count, error } = await query;
  if (error) return serverErrorResponse("deadlines list failed", error);

  return successResponse(data, { meta: { total: count ?? 0, page, limit } });
}

/**
 * POST /api/deadlines — create (SPEC-API-004 AC-1/AC-6). Reminder governance
 * (reminders_enabled/reminder_lead_minutes) is inherited from the parent
 * Course, so the Course must be looked up (and owned by the caller — AC-4)
 * before the Reminder can be scheduled. person_id (People feature) is
 * likewise inherited from the Course, never accepted from the client
 * (deadlinePayloadSchema has no such field) — a Deadline's owner is always
 * its Course's owner.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = deadlinePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, reminders_enabled, reminder_lead_minutes, person_id")
    .eq("id", parsed.data.course_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (courseError) return serverErrorResponse("course lookup failed", courseError);
  if (!course) return notFoundResponse();

  const { data: deadline, error: insertError } = await supabase
    .from("deadlines")
    .insert({ user_id: user.id, ...parsed.data, person_id: course.person_id })
    .select("*")
    .single();
  if (insertError) return serverErrorResponse("deadline create failed", insertError);

  await syncReminderForTarget(supabase, {
    userId: user.id,
    targetType: "deadline",
    targetId: deadline.id,
    dueAt: deadline.due_at,
    remindersEnabled: course.reminders_enabled,
    reminderLeadMinutes: course.reminder_lead_minutes,
  });

  return successResponse(deadline, { status: 201 });
}
