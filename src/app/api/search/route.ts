import type { NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, validationErrorResponse, serverErrorResponse } from "@/lib/api/response";

const MAX_RESULTS_PER_TYPE = 5;

export interface SearchResult {
  id: string;
  type: "course" | "deadline" | "task" | "note";
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

  const pattern = `%${q}%`;
  const results: SearchResult[] = [];

  const [coursesRes, deadlinesRes, tasksRes, notesRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, code, term")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .or(`name.ilike.${pattern},code.ilike.${pattern}`)
      .limit(MAX_RESULTS_PER_TYPE),
    supabase
      .from("deadlines")
      .select("id, title, status")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .limit(MAX_RESULTS_PER_TYPE),
    supabase
      .from("tasks")
      .select("id, title, status")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .limit(MAX_RESULTS_PER_TYPE),
    supabase
      .from("notes")
      .select("id, body")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .ilike("body", pattern)
      .limit(MAX_RESULTS_PER_TYPE),
  ]);

  if (coursesRes.error) return serverErrorResponse("search courses failed", coursesRes.error);
  if (deadlinesRes.error) return serverErrorResponse("search deadlines failed", deadlinesRes.error);
  if (tasksRes.error) return serverErrorResponse("search tasks failed", tasksRes.error);
  if (notesRes.error) return serverErrorResponse("search notes failed", notesRes.error);

  for (const course of coursesRes.data ?? []) {
    results.push({
      id: course.id,
      type: "course",
      title: course.code ? `${course.code} — ${course.name}` : course.name,
      subtitle: course.term ?? null,
      href: `/courses/${course.id}`,
    });
  }

  for (const deadline of deadlinesRes.data ?? []) {
    results.push({
      id: deadline.id,
      type: "deadline",
      title: deadline.title,
      subtitle: deadline.status,
      href: `/deadlines/${deadline.id}`,
    });
  }

  for (const task of tasksRes.data ?? []) {
    results.push({
      id: task.id,
      type: "task",
      title: task.title,
      subtitle: task.status,
      href: `/tasks/${task.id}`,
    });
  }

  for (const note of notesRes.data ?? []) {
    const preview = note.body.length > 80 ? `${note.body.slice(0, 80)}…` : note.body;
    results.push({
      id: note.id,
      type: "note",
      title: preview,
      subtitle: null,
      href: `/notes`,
    });
  }

  return successResponse(results);
}
