import type OpenAI from "openai";

// Deliberately narrower than the internal ScheduleTimeWindow
// (schedule-time-window.ts) -- "today"/"tomorrow" are NOT included here, so
// the type system itself keeps them unreachable from a model tool call. The
// model resolves any relative date itself (see each tool's `date`
// description below) and passes window: "date" with the resolved date,
// exactly the way due_at is already resolved for a mutation. "today" stays
// reachable only via the internal preload call in conversation-core.ts,
// which never goes through these tool schemas.
export type ModelFacingScheduleWindow = "date" | "week" | "unscoped";
const SCHEDULE_WINDOWS: readonly ModelFacingScheduleWindow[] = ["date", "week", "unscoped"];

export interface GetScheduleArgs {
  window: ModelFacingScheduleWindow;
  /** Required (non-null) only when window is "date" -- YYYY-MM-DD, model-resolved. Null otherwise. */
  date: string | null;
}

export interface GetPersonScheduleArgs {
  person_id: string;
  window: ModelFacingScheduleWindow;
  /** Required (non-null) only when window is "date" -- YYYY-MM-DD, model-resolved. Null otherwise. */
  date: string | null;
}

export interface LookupKnowledgeArgs {
  query: string;
}

export interface GetDeadlineProgressArgs {
  deadline_id: string;
}

export interface RespondToUserArgs {
  message: string;
  needs_follow_up: boolean;
}

/**
 * Mirrors intent.ts's mutationSchema field set (flattened across every
 * target_type variant, each nullable) plus confidence/summary. Deliberately
 * flat rather than a JSON-schema anyOf/oneOf mirroring mutationSchema's zod
 * discriminatedUnion: mutationSchema's branches are plain (non-strict) zod
 * objects that silently drop unrecognized keys, so this flat shape can be
 * handed to `mutationSchema.parse(...)` unmodified in conversation-core.ts —
 * zod picks the right branch by target_type and ignores the fields that
 * belong to other branches — getting full reuse of the existing validation
 * with no new logic and no dependency on nested-schema support in strict
 * tool-calling mode.
 *
 * `event`'s enum is the union of every target_type's own transition-event
 * vocabulary (deadline/task/session/reminder each have a distinct, narrower
 * one in intent.ts) -- the flat JSON schema can't discriminate which subset
 * applies, but mutationSchema.parse's per-branch enum still rejects a value
 * that doesn't belong to the target_type actually sent (e.g. event:
 * "user_marks_done" with target_type "deadline" fails validation exactly
 * like any other cross-branch field mismatch).
 */
export interface ProposeMutationArgs {
  confidence: number;
  summary: string;
  target_type: "course" | "deadline" | "task" | "note" | "reminder" | "session" | "todo_list" | "todo_item";
  operation: "create" | "update" | "delete" | "acknowledge" | "transition";
  target_id: string | null;
  course_id: string | null;
  title: string | null;
  due_at: string | null;
  body: string | null;
  priority: "Low" | "Medium" | "High" | "Urgent" | null;
  reminder_lead_minutes: number | null;
  event:
    | "user_acknowledges"
    | "user_dismisses"
    | "user_snoozes"
    | "user_marks_in_progress"
    | "user_marks_submitted"
    | "user_confirms_done"
    | "user_marks_done"
    | "user_cancels"
    | "user_marks_session_done"
    | "user_marks_session_skipped"
    | null;
  snooze_until: string | null;
  // Course (name/code/term) and Course To-Do list (name only, reusing the
  // same field) create/update fields.
  name: string | null;
  code: string | null;
  term: string | null;
  // Deadline Session (appointments row, category "Session") create fields.
  deadline_id: string | null;
  date: string | null;
  time: string | null;
  duration_minutes: number | null;
  // Course To-Do item fields -- list_id/due_date/done are distinct from a
  // Deadline/Task's course_id/due_at/status-transition equivalents since a
  // to-do item has its own (non-course, non-transition) shape.
  list_id: string | null;
  due_date: string | null;
  done: boolean | null;
}

/** get_personalization_suggestions and start_new_conversation both take no arguments. */
export type EmptyToolArgs = Record<string, never>;

/**
 * OpenAI tool-calling schemas for the conversational core (src/lib/voice/
 * conversation-core.ts). This file only owns the schema/name surface --
 * each handler's actual implementation lives where the dispatch switch (2e)
 * reuses an existing function:
 *   get_schedule                     -> loadSchedule (schedule-loader.ts)
 *   get_person_schedule              -> loadSchedule(..., personId) (schedule-loader.ts)
 *   lookup_knowledge                 -> runKnowledgeLookup (knowledge/retrieval.ts)
 *   get_personalization_suggestions  -> runSuggestionsLookup (suggestions-lookup.ts)
 *   get_deadline_progress            -> runDeadlineProgressLookup (deadline-progress-lookup.ts)
 *   start_new_conversation           -> endConversation + resolveActiveConversation (conversation-memory.ts)
 *   respond_to_user                  -> handled directly in conversation-core's loop, not dispatchTool
 *   propose_mutation                 -> handled directly in conversation-core's loop, not dispatchTool
 *
 * `strict: true` on every entry gets constrained decoding on arguments
 * (every property required, additionalProperties false) -- this refactor's
 * whole premise depends on tool-call arguments actually parsing, so it's
 * worth the guarantee over the small loss of schema flexibility.
 *
 * `as const satisfies` (rather than a plain `OpenAI.ChatCompletionTool[]`
 * annotation) keeps each `function.name` literal-typed, so ToolName below
 * is derived from this array instead of duplicated as a separate list --
 * the two can never drift out of lockstep.
 */
export const CONVERSATION_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_schedule",
      description:
        'Look up the user\'s Deadlines, Tasks, open Course To-Do / custom-project items, Course meeting/class occurrences, and planned Deadline work Sessions due or happening within a time window. Returns structured data already grouped by day and sorted by priority -- narrate it yourself in prose, never invent your own ordering, and never re-rank it. Today\'s schedule (window: "date", date: today) is already provided to you in the system prompt -- do not call this tool for today again. Call it with window: "date" for any other single day (resolve "yesterday", "tomorrow", "3 days ago", "next Tuesday", etc. into a YYYY-MM-DD date yourself first, the same way you resolve due_at for a mutation), or window: "week"/"unscoped" for a range.',
      strict: true,
      parameters: {
        type: "object",
        properties: {
          window: {
            type: "string",
            enum: SCHEDULE_WINDOWS,
            description:
              '"date" (a single specific day -- pass the resolved date below), "week" (the next 7 days including today), or "unscoped" (no date filter -- the next few upcoming items of each kind).',
          },
          date: {
            type: ["string", "null"],
            description:
              'Required (non-null) only when window is "date": the calendar date to look up, as YYYY-MM-DD in the user\'s own timezone. Resolve the user\'s relative-date phrasing ("today", "yesterday", "3 days ago", "next Tuesday") into this date yourself, using the current time and timezone given to you below -- the same way you already resolve due_at when creating a Task or Deadline. Null when window is "week" or "unscoped".',
          },
        },
        required: ["window", "date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person_schedule",
      description:
        "Look up a specific tracked Person's (not the user's own) schedule for a time window -- use when the user asks about someone else by name or relationship (\"my sister's schedule\", \"is Châu free right now\", \"do I need to pick her up\"). Returns ONLY that Person's Course meeting/class occurrences and Tasks -- never Deadlines (a tracked Person is never assigned a Deadline directly in this product) and never Course To-Do items (those only ever belong to the account owner). Don't be surprised if a Person's day looks sparser than the user's own -- that's expected, not a sign something is missing. person_id MUST be an id from the `people` list in the entity context provided to you -- match it by the person's relationship field or name as mentioned in the request. Never invent a person_id, and never call this for the user's own schedule (use get_schedule for that). If no person in the entity context matches what the user said, do not guess -- call respond_to_user explaining you don't have anyone tracked under that name/relationship.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          person_id: { type: "string", description: "An id from the `people` array in the entity context. Never invented." },
          window: {
            type: "string",
            enum: SCHEDULE_WINDOWS,
            description: '"date" (a single specific day -- pass the resolved date below), "week" (the next 7 days including today), or "unscoped" (no date filter).',
          },
          date: {
            type: ["string", "null"],
            description:
              'Required (non-null) only when window is "date": the calendar date to look up, as YYYY-MM-DD in the user\'s own timezone -- resolve relative phrasing ("yesterday", "3 days ago", "next Tuesday") yourself the same way you resolve due_at. Null when window is "week" or "unscoped".',
          },
        },
        required: ["person_id", "window", "date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_knowledge",
      description:
        "Search the user's personal knowledge base (saved notes, links, imported documents) for an answer. This tool has no memory of the conversation, so restate the user's question as a focused, self-contained search query using context from the conversation so far. The entity context you're given elsewhere only lists each saved source's id and title, never its content -- recognizing a title match is a reason to call this tool, not a substitute for calling it. Never tell the user a source has no content, or answer from its title alone, without having called this tool first.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A focused, self-contained search query, in the user's own terms." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_personalization_suggestions",
      description: "Check for pending personalization suggestions (e.g. reminder-timing adjustments) generated from the user's recent feedback.",
      strict: true,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deadline_progress",
      description:
        "Look up planned-session progress toward a specific Deadline (\"how much progress on Homework 1\", \"how many sessions do I have left\"). deadline_id MUST be an id from the `deadlines` list in the entity context provided to you -- match it by the deadline's title as mentioned in the request. Never invent a deadline_id; if no deadline in the entity context matches what the user said, do not guess -- call respond_to_user explaining you don't have a matching deadline.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          deadline_id: { type: "string", description: "An id from the `deadlines` array in the entity context. Never invented." },
        },
        required: ["deadline_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_new_conversation",
      description:
        "Silently end the current conversation and start a fresh one, discarding prior turns from memory. Call this only when the user explicitly asks to start over, forget what was said before, or begin a new conversation. Never announce that you did this -- just continue naturally with whatever else the user asked in the same turn.",
      strict: true,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_user",
      description:
        'Deliver your final spoken answer for this turn. Call this by itself, only after you\'ve already called any data tools you needed -- never in the same turn as another tool call. Set needs_follow_up to true only when `message` ends by asking the user a question or presenting a choice/decision that expects a reply next (e.g. "Want me to do X, or check Y instead?"). Set it to false for a complete answer or statement, even one that casually invites more questions ("let me know if you want more detail") without actually needing a reply to continue.',
      strict: true,
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The final response to speak back to the user." },
          needs_follow_up: {
            type: "boolean",
            description: "True only if this message asks a question or presents a choice that expects the user to reply next.",
          },
        },
        required: ["message", "needs_follow_up"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_mutation",
      description:
        "Propose a single explicit, unambiguous data change the user just instructed: create/update/delete a Deadline, Task, Note, or Course; mark a Deadline's or Task's status via transition (\"mark done\", \"mark in progress\", \"mark submitted\", \"cancel\"); acknowledge/dismiss/snooze a Reminder; create/delete a Deadline Session or mark one done/skipped; create a Course To-Do list; create/update/delete a Course To-Do item (including marking it done via `done`). Call this by itself, never alongside another tool call. Never invent an id -- target_id/course_id/deadline_id/list_id must come from the entity context provided to you. If you are not confident this is really a command (versus a question or hypothetical) or an id does not clearly match the context, set confidence below 0.95 rather than guessing -- do not silently answer via respond_to_user instead just because you are unsure, since that skips the confirmation step entirely.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          confidence: { type: "number", description: "0-1, your genuine confidence this is the right mutation to propose." },
          summary: { type: "string", description: "One sentence describing the action, to be spoken back to the user for confirmation." },
          target_type: { type: "string", enum: ["course", "deadline", "task", "note", "reminder", "session", "todo_list", "todo_item"] },
          operation: { type: "string", enum: ["create", "update", "delete", "acknowledge", "transition"] },
          target_id: {
            type: ["string", "null"],
            description:
              "An id from the provided entity context (deadlines/tasks/todoItems/sessions lists as appropriate). Null only for a create.",
          },
          course_id: { type: ["string", "null"], description: "A course id from the entity context. Used by a Deadline create and, optionally, a Course To-Do list create." },
          title: { type: ["string", "null"], description: "Deadline/Task title, or a new Deadline Session's title." },
          due_at: { type: ["string", "null"], description: "Deadline/Task due date-time. ISO 8601 datetime with a UTC offset." },
          body: { type: ["string", "null"], description: "Note body." },
          priority: { type: ["string", "null"], enum: ["Low", "Medium", "High", "Urgent", null], description: "Deadline/Task/Course To-Do item priority." },
          reminder_lead_minutes: { type: ["integer", "null"] },
          event: {
            type: ["string", "null"],
            enum: [
              "user_acknowledges",
              "user_dismisses",
              "user_snoozes",
              "user_marks_in_progress",
              "user_marks_submitted",
              "user_confirms_done",
              "user_marks_done",
              "user_cancels",
              "user_marks_session_done",
              "user_marks_session_skipped",
              null,
            ],
            description:
              'Required for operation "transition"/"acknowledge". Deadline: user_marks_in_progress/user_marks_submitted/user_confirms_done/user_cancels. Task: user_marks_done/user_cancels. Session: user_marks_session_done/user_marks_session_skipped. Reminder (acknowledge): user_acknowledges/user_dismisses/user_snoozes. Null otherwise.',
          },
          snooze_until: { type: ["string", "null"], description: "Reminder acknowledge with event user_snoozes only." },
          name: { type: ["string", "null"], description: "Course name, or a new Course To-Do list's name." },
          code: { type: ["string", "null"], description: "Course code (e.g. \"CS 101\")." },
          term: { type: ["string", "null"], description: "Course term (e.g. \"Fall 2026\")." },
          deadline_id: { type: ["string", "null"], description: "A deadline id from the entity context. Required to create a Deadline Session." },
          date: { type: ["string", "null"], description: "A Deadline Session's date, YYYY-MM-DD, resolved from relative phrasing the same way due_at is." },
          time: { type: ["string", "null"], description: "A Deadline Session's free-text time label (e.g. \"7:00 PM\"), if the user gave one." },
          duration_minutes: { type: ["integer", "null"], description: "A Deadline Session's planned duration in minutes, if the user gave one." },
          list_id: { type: ["string", "null"], description: "A Course To-Do list id from the entity context. Required to create a to-do item." },
          due_date: { type: ["string", "null"], description: "A Course To-Do item's due date, YYYY-MM-DD (no time-of-day)." },
          done: { type: ["boolean", "null"], description: "Course To-Do item update only: true marks it complete, false marks it incomplete. Null otherwise." },
        },
        required: [
          "confidence",
          "summary",
          "target_type",
          "operation",
          "target_id",
          "course_id",
          "title",
          "due_at",
          "body",
          "priority",
          "reminder_lead_minutes",
          "event",
          "snooze_until",
          "name",
          "code",
          "term",
          "deadline_id",
          "date",
          "time",
          "duration_minutes",
          "list_id",
          "due_date",
          "done",
        ],
        additionalProperties: false,
      },
    },
  },
] as const satisfies OpenAI.ChatCompletionTool[];

export type ToolName = (typeof CONVERSATION_TOOLS)[number]["function"]["name"];
