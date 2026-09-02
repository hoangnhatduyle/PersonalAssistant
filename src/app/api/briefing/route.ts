import OpenAI from "openai";
import { requireAuthenticatedContext } from "@/lib/api/auth";
import { requireEnv } from "@/lib/env";
import { successResponse, serverErrorResponse } from "@/lib/api/response";

export interface BriefingResponse {
  briefing: string;
  date: string;
}

const BRIEFING_SYSTEM_PROMPT = `You are a friendly personal assistant for a university student. Produce a concise, upbeat morning briefing summarizing their day ahead. Cover:
1. Today's class meetings (times, locations)
2. Deadlines due today or overdue
3. Open tasks due today
4. Upcoming reminders
5. Appointments today
6. A motivational closing line

Keep it conversational and under 200 words. Do not use markdown — plain text only, with line breaks between sections. If a category has nothing, skip it entirely. Focus on what's actionable.

Respond with ONLY a JSON object: { "briefing": string }`;

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
        .is("deleted_at", null),
      supabase
        .from("deadlines")
        .select("title, due_at, status, priority")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .or(`due_at.lte.${todayEnd},status.eq.Overdue`)
        .in("status", ["Not Started", "In Progress", "Submitted", "Overdue"]),
      supabase
        .from("tasks")
        .select("title, due_at, status, tags")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .eq("status", "Open")
        .lte("due_at", todayEnd),
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

    const context = {
      now: now.toISOString(),
      day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
      todays_classes: todayMeetings,
      deadlines: (deadlinesRes.data ?? []).map((d) => ({
        title: d.title,
        due_at: d.due_at,
        status: d.status,
        priority: d.priority,
      })),
      tasks: (tasksRes.data ?? []).map((t) => ({
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
    };

    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: BRIEFING_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(context) },
      ],
    });

    const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}");
    const briefing = typeof raw.briefing === "string" ? raw.briefing : "Have a great day!";

    return successResponse<BriefingResponse>({ briefing, date: todayStr });
  } catch (error) {
    return serverErrorResponse("briefing generation failed", error);
  }
}
