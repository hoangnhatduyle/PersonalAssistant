import type { EntityContext, RawMutation } from "@/lib/voice/intent";

/**
 * Deterministic guard against a transition the target's current status does
 * not allow -- e.g. user_confirms_done on a Deadline that is still "Not
 * Started", which src/lib/api/transitions.ts only permits from "Submitted".
 *
 * Enforced here rather than left to the model's judgement because the prompt
 * alone did not hold: measured over 22 samples, the model proposed exactly
 * that illegal transition at 0.97-0.99 confidence, so the user was asked to
 * confirm an action the API would then refuse. The status and the rule were
 * both available to it; a soft "set confidence below 0.95" instruction is
 * simply not a reliable way to enforce a state machine.
 *
 * Returns a clarifying question naming the moves that ARE available, which the
 * conversational core speaks and saves as a draft -- the same "ask instead of
 * propose" shape gateDeadlineRecurrence already uses, so the core needs no new
 * plumbing. Deliberately does NOT auto-chain the intermediate transitions
 * ("Not Started" -> Completed is three hops): each would need its own spoken
 * confirmation, and the app's own UI gates its status dropdown by this same
 * table, so stepping through states is the product's existing semantics.
 *
 * Unlike gateDeadlineRecurrence there is no alreadyAsked/default-on-second-ask
 * guard, because there is no safe default to fall back to: an illegal
 * transition has no legal equivalent to silently substitute. Re-asking is
 * therefore correct rather than a loop risk -- an "ask" ends the turn and
 * waits for the user, so reaching this gate twice requires two separate
 * utterances that both resolve to an impossible transition.
 */
export type LegalityGateResult =
  | { kind: "ask"; question: string; mutation: RawMutation }
  | { kind: "proceed"; mutation: RawMutation };

/** How each transition event reads out loud, for a question the user can act on. */
const EVENT_PHRASES: Record<string, string> = {
  user_marks_in_progress: "mark it in progress",
  user_marks_submitted: "mark it submitted",
  user_confirms_done: "mark it complete",
  user_marks_done: "mark it done",
  user_cancels: "cancel it",
  user_marks_session_done: "mark it done",
  user_marks_session_skipped: "mark it skipped",
  user_marks_event_done: "mark it done",
  user_marks_event_missed: "mark it missed",
};

/** "a, b, or c" -- an Oxford-free list, since this is spoken aloud. */
function speakList(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  if (phrases.length === 2) return `${phrases[0]} or ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, or ${phrases.at(-1)}`;
}

function buildQuestion(label: string, status: string, validEvents: string[]): string {
  const options = validEvents.map((event) => EVENT_PHRASES[event]).filter(Boolean);
  if (options.length === 0) {
    return `${label} is already ${status}, so there's nothing left to change on it. Anything else?`;
  }
  return `${label} is currently ${status}, so I can't do that directly. I can ${speakList(options)} — which would you like?`;
}

/**
 * The target row for a transition, if the entity context has it. A missing row
 * is not this gate's problem: mutationSchema and the tool's own "never invent
 * an id" rule already cover an unresolvable target, so it proceeds untouched.
 */
function findTarget(
  raw: RawMutation,
  context: EntityContext,
): { label: string; status: string; validEvents: string[] } | null {
  switch (raw.target_type) {
    case "deadline": {
      const row = context.deadlines.find((d) => d.id === raw.target_id);
      return row ? { label: row.title, status: row.status, validEvents: row.validEvents } : null;
    }
    case "task": {
      const row = context.tasks.find((t) => t.id === raw.target_id);
      return row ? { label: row.title, status: row.status, validEvents: row.validEvents } : null;
    }
    case "session": {
      const row = context.sessions.find((s) => s.id === raw.target_id);
      return row ? { label: row.title, status: row.status, validEvents: row.validEvents } : null;
    }
    case "event": {
      const row = context.appointments.find((a) => a.id === raw.target_id);
      return row ? { label: row.title, status: row.status, validEvents: row.validEvents } : null;
    }
    default:
      return null;
  }
}

export function gateTransitionLegality(raw: RawMutation, context: EntityContext): LegalityGateResult {
  if (raw.operation !== "transition" || !raw.event) return { kind: "proceed", mutation: raw };

  const target = findTarget(raw, context);
  if (!target) return { kind: "proceed", mutation: raw };
  if (target.validEvents.includes(raw.event)) return { kind: "proceed", mutation: raw };

  return { kind: "ask", question: buildQuestion(target.label, target.status, target.validEvents), mutation: raw };
}
