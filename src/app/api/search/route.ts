import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

import { MATCH_TIER, escapeLikePattern, matchTier, rankByTier, type MatchTier } from "@/lib/search/rank";

// Over-fetch per table, rank in memory, then keep the best few per type.
const FETCH_PER_TYPE = 15;
const MAX_RESULTS_PER_TYPE = 6;

export interface SearchResult {
  id: string;
  type: "course" | "deadline" | "task" | "session" | "event";
  title: string;
  subtitle: string | null;
  href: string;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return validationErrorResponse("Query must be at least 2 characters");

  const pattern = `%${escapeLikePattern(q)}%`;

  const [coursesRes, deadlinesRes, tasksRes, appointmentsRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, code, term")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .or(`name.ilike.${pattern},code.ilike.${pattern}`)
      .limit(FETCH_PER_TYPE),
    supabase
      .from("deadlines")
      .select("id, title, status")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .limit(FETCH_PER_TYPE),
    supabase
      .from("tasks")
      .select("id, title, status")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .limit(FETCH_PER_TYPE),
    // Sessions are appointments linked to a deadline; plain appointments are events.
    supabase
      .from("appointments")
      .select("id, title, date, location, deadline_id, deadline:deadlines(title)")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .or(`title.ilike.${pattern},location.ilike.${pattern}`)
      .order("date", { ascending: false })
      .limit(FETCH_PER_TYPE),
  ]);

  if (coursesRes.error) return serverErrorResponse("search courses failed", coursesRes.error);
  if (deadlinesRes.error) return serverErrorResponse("search deadlines failed", deadlinesRes.error);
  if (tasksRes.error) return serverErrorResponse("search tasks failed", tasksRes.error);
  if (appointmentsRes.error) return serverErrorResponse("search appointments failed", appointmentsRes.error);

  type Ranked = SearchResult & { tier: MatchTier };
  const top = (rows: Ranked[]): SearchResult[] =>
    rankByTier(rows)
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map(({ id, type, title, subtitle, href }) => ({ id, type, title, subtitle, href }));

  const courses: Ranked[] = (coursesRes.data ?? []).map((course) => {
    const title = course.code ? `${course.code} — ${course.name}` : course.name;
    return {
      id: course.id,
      type: "course",
      title,
      subtitle: course.term ?? null,
      href: `/courses/${course.id}`,
      tier: matchTier(q, title) ?? MATCH_TIER.substring,
    };
  });

  const deadlines: Ranked[] = (deadlinesRes.data ?? []).map((deadline) => ({
    id: deadline.id,
    type: "deadline",
    title: deadline.title,
    subtitle: deadline.status,
    href: `/courses/deadlines/${deadline.id}`,
    tier: matchTier(q, deadline.title) ?? MATCH_TIER.substring,
  }));

  const tasks: Ranked[] = (tasksRes.data ?? []).map((task) => ({
    id: task.id,
    type: "task",
    title: task.title,
    subtitle: task.status,
    href: `/board/${task.id}`,
    tier: matchTier(q, task.title) ?? MATCH_TIER.substring,
  }));

  const appointments: Ranked[] = (appointmentsRes.data ?? []).map((appt) => {
    const isSession = appt.deadline_id !== null;
    const parts = [isSession ? appt.deadline?.title : null, formatDate(appt.date), appt.location].filter(Boolean);
    return {
      id: appt.id,
      type: isSession ? "session" : "event",
      title: appt.title,
      subtitle: parts.join(" · "),
      href: `/calendar?date=${appt.date}`,
      tier: matchTier(q, appt.title, [appt.location]) ?? MATCH_TIER.body,
    };
  });

  return successResponse([...top(courses), ...top(deadlines), ...top(tasks), ...top(appointments)]);
}

/** `date` is a plain YYYY-MM-DD; format it in UTC so the viewer's timezone can't shift the day. */
function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
