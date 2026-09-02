import OpenAI from "openai";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { requireEnv } from "@/lib/env";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import { buildSuggestion, type Suggestion } from "@/lib/dashboard/suggestion";
import { generateSuggestionsForUser } from "@/lib/personalization/generate-for-user";
import type { DeadlineRow, TaskRow, PersonalizationSuggestionRow } from "@/lib/api/entity-types";
import type { StatusTone } from "@/lib/status-colors";

export interface DailyIntelligenceResponse {
  date: string;
  narrative: string;
  workload: { tone: StatusTone; message: string };
  suggestions: PersonalizationSuggestionRow[];
  suggestionsGenerated: number;
}

const INTELLIGENCE_SYSTEM_PROMPT = `You are a friendly personal assistant for a university student. Produce a concise, upbeat daily overview summarizing their day ahead. Cover:
1. Today's class meetings (times, locations)
2. Deadlines due today or overdue
3. Open tasks due today
4. Upcoming reminders
5. Appointments today
6. A motivational closing line

A separate workload banner already highlights the most urgent deadline, so do NOT repeat that exact message. Instead, weave deadline urgency naturally into the overview if relevant.

Keep it conversational and under 200 words. Do not use markdown — plain text only, with line breaks between sections. If a category has nothing, skip it entirely. Focus on what's actionable.

Respond with ONLY a JSON object: { "narrative": string }`;

export async function POST() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayStart = `${todayStr}T00:00:00.000Z`;
  const todayEnd = `${todayStr}T23:59:59.999Z`;

  try {
    const [coursesRes, deadlinesRes, tasksRes, remindersRes, appointmentsRes] = await Promise.all([
      supabase
        .from("courses")
        .select("name, code, meeting_blocks, location")
        .eq("user_id", user.id)
        .is("person_id", null)
        .is("deleted_at", null),
      supabase
        .from("deadlines")
        .select("*")
        .eq("user_id", user.id)
        .is("person_id", null)
        .is("deleted_at", null)
        .in("status", ["Not Started", "In Progress", "Submitted", "Overdue"]),
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .is("person_id", null)
        .is("deleted_at", null)
        .eq("status", "Open"),
      supabase
        .from("reminders")
        .select("target_type, target_id, trigger_at, acknowledgment_state")
        .eq("user_id", user.id)
        .in("acknowledgment_state", ["Scheduled", "Delivered", "Snoozed"])
        .gte("trigger_at", todayStart)
        .lte("trigger_at", todayEnd),
      supabase
        .from("appointments")
        .select("title, date, time, location, category")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .eq("date", todayStr),
    ]);

    const allDeadlines = (deadlinesRes.data ?? []) as DeadlineRow[];
    const allTasks = (tasksRes.data ?? []) as TaskRow[];

    // Workload heuristic — deterministic, no LLM cost
    const workload: Suggestion = buildSuggestion(allDeadlines, allTasks, now);

    // Narrow to today-relevant items for the LLM context
    const todayDeadlines = allDeadlines.filter(
      (d) => d.status === "Overdue" || new Date(d.due_at).getTime() <= new Date(todayEnd).getTime(),
    );
    const todayTasks = allTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() <= new Date(todayEnd).getTime());

    const dayOfWeek = now.getDay();
    const todayMeetings = (coursesRes.data ?? []).flatMap((course) => {
      const blocks = (course.meeting_blocks ?? []) as Array<{
        days: number[];
        startMinutes: number;
        endMinutes: number;
      }>;
      return blocks
        .filter((block) => block.days.includes(dayOfWeek))
        .map((block) => ({
          course: course.code ?? course.name,
          location: course.location,
          start: `${Math.floor(block.startMinutes / 60)}:${String(block.startMinutes % 60).padStart(2, "0")}`,
          end: `${Math.floor(block.endMinutes / 60)}:${String(block.endMinutes % 60).padStart(2, "0")}`,
        }));
    });

    const llmContext = {
      now: now.toISOString(),
      day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
      todays_classes: todayMeetings,
      deadlines: todayDeadlines.map((d) => ({
        title: d.title,
        due_at: d.due_at,
        status: d.status,
        priority: d.priority,
      })),
      tasks: todayTasks.map((t) => ({
        title: t.title,
        due_at: t.due_at,
        tags: t.tags,
      })),
      reminders_today: (remindersRes.data ?? []).length,
      appointments: (appointmentsRes.data ?? []).map((a) => ({
        title: a.title,
        time: a.time,
        location: a.location,
        category: a.category,
      })),
      workload_status: workload.message,
    };

    // Run LLM narrative and personalization generation in parallel
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

    const [completion, suggestionsResult] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INTELLIGENCE_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(llmContext) },
        ],
      }),
      generateSuggestionsForUser(supabase, user.id).catch((error) => {
        console.error("personalization generation failed (non-fatal)", error);
        return { candidatesEvaluated: 0, created: 0, skipped: 0 };
      }),
    ]);

    const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}");
    const narrative = typeof raw.narrative === "string" ? raw.narrative : "Have a great day!";

    // Fetch all pending suggestions (including any just created)
    const { data: pendingSuggestions } = await supabase
      .from("personalization_suggestions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return successResponse<DailyIntelligenceResponse>({
      date: todayStr,
      narrative,
      workload: { tone: workload.tone, message: workload.message },
      suggestions: (pendingSuggestions ?? []) as PersonalizationSuggestionRow[],
      suggestionsGenerated: suggestionsResult.created,
    });
  } catch (error) {
    return serverErrorResponse("intelligence generation failed", error);
  }
}
