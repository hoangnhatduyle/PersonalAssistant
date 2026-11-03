import type { EntityContext } from "@/lib/voice/intent";

/**
 * Repairs entity ids the model copied imperfectly.
 *
 * The model is told to take every id from the entity context and never invent
 * one, but copying a 36-character UUID is exactly the kind of thing it gets
 * subtly wrong: in the live eval it reproduces the first group correctly and
 * garbles the rest ("14eaf9f1-81d5-4c12-..." for "14eaf9f1-81c5-483c-..."),
 * which sent a perfectly clear request ("cancel the quiz") to an id that
 * matches nothing, in roughly 4 of 10 runs. A speech-to-speech model copying
 * ids from a spoken-style conversation is no better.
 *
 * The first 8 hex characters are the part that is reliably right, and in a
 * user's own entity set they identify one record. So an id that is not in the
 * context is replaced by the single context id sharing its first 8 characters.
 * Zero matches, or more than one, leaves it alone -- the existing "unknown id"
 * handling then reports it exactly as before. A repaired id is therefore always
 * one the user already owns and the model was already shown: this never widens
 * what a request can reach, it only fixes which of the user's own records it
 * names.
 */

const PREFIX_LENGTH = 8;
const HEX_PREFIX = /^[0-9a-f]{8}/i;

/** Argument names that carry an id the model took from the entity context. */
const ID_FIELDS = ["target_id", "course_id", "deadline_id", "list_id", "person_id"] as const;

export interface IdRepair {
  field: string;
  from: string;
  to: string;
}

/** Every id the model was shown in the entity context (all entity types). */
export function collectKnownIds(context: EntityContext): string[] {
  const ids = [
    ...context.courses,
    ...context.deadlines,
    ...context.tasks,
    ...context.todoLists,
    ...context.sessions,
    ...context.appointments,
    ...context.knowledgeSources,
    ...context.people,
  ].map((entity) => entity.id);
  return [...new Set(ids)];
}

/** The one known id that `candidate` is a garbled copy of, or null when it is exact, unknown, or ambiguous. */
export function repairId(candidate: unknown, knownIds: readonly string[]): string | null {
  if (typeof candidate !== "string" || !HEX_PREFIX.test(candidate)) return null;
  if (knownIds.includes(candidate)) return null;
  const prefix = candidate.slice(0, PREFIX_LENGTH).toLowerCase();
  const matches = knownIds.filter((known) => known.slice(0, PREFIX_LENGTH).toLowerCase() === prefix);
  return matches.length === 1 ? matches[0] : null;
}

function repairFields(object: Record<string, unknown>, knownIds: readonly string[], repairs: IdRepair[]): Record<string, unknown> {
  const out = { ...object };
  for (const field of ID_FIELDS) {
    const fixed = repairId(out[field], knownIds);
    if (fixed !== null) {
      repairs.push({ field, from: out[field] as string, to: fixed });
      out[field] = fixed;
    }
  }
  return out;
}

/**
 * Returns `raw` (a parsed tool-call arguments object) with its id fields
 * repaired, including those of each `additional_steps` item. The input is not
 * mutated. Anything that is not a plain object is returned untouched so the
 * caller's own schema validation reports it as it always did.
 */
export function repairIdsInArgs(raw: unknown, context: EntityContext): { value: unknown; repairs: IdRepair[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { value: raw, repairs: [] };

  const knownIds = collectKnownIds(context);
  const repairs: IdRepair[] = [];
  const value = repairFields(raw as Record<string, unknown>, knownIds, repairs);
  if (Array.isArray(value.additional_steps)) {
    value.additional_steps = value.additional_steps.map((step: unknown) =>
      typeof step === "object" && step !== null && !Array.isArray(step) ? repairFields(step as Record<string, unknown>, knownIds, repairs) : step,
    );
  }
  return { value, repairs };
}
